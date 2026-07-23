using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Ataven.Enums;
using Ataven.Models;
using Bimser.Synergy.ServiceAPI;
using Bimser.Synergy.ServiceAPI.Models.Form;

namespace Ataven.Managers
{
    public class TransferSessionManager
    {
        private static readonly ConcurrentDictionary<string, FlowTransferSession> FlowSessions = new ConcurrentDictionary<string, FlowTransferSession>();
        private static readonly TimeSpan SessionTtl = TimeSpan.FromMinutes(30);
        private readonly ServiceAPI _serviceAPI;

        public TransferSessionManager(ServiceAPI serviceAPI)
        {
            _serviceAPI = serviceAPI;
        }

        public BeginSessionResultModel BeginFlowSession(BeginFlowSessionRequestModel request)
        {
            CleanupExpiredSessions();

            dynamic createFlow = _serviceAPI.WorkflowManager.Create(request.ProjectName, request.FlowName, 0).Result;
            createFlow.StartingEvent = createFlow.Events[request.StartingEvent];

            FormManager formManager = new FormManager(_serviceAPI);
            Dictionary<string, FormInstance> documents = new Dictionary<string, FormInstance>();

            foreach (FlowDocumentModel fd in request.FlowDocuments)
            {
                FormInstance formInstance = createFlow.Documents[fd.DocumentName].FormInstance;
                formManager.PrepareForm(formInstance, fd.FormFields, fd.FormParameters, null, false);
                documents[fd.DocumentName] = formInstance;
            }

            string sessionId = Guid.NewGuid().ToString("N");
            FlowSessions[sessionId] = new FlowTransferSession
            {
                CreatedAt = DateTime.UtcNow,
                LastAccessAt = DateTime.UtcNow,
                FlowInstance = createFlow,
                FlowParameters = request.FlowParameters,
                Documents = documents,
                UploadedFiles = new Dictionary<string, SessionFileUpload>()
            };

            return new BeginSessionResultModel { SessionId = sessionId };
        }

        public object AppendRelatedGridRows(AppendRelatedGridRowsRequestModel request)
        {
            FlowTransferSession session = GetFlowSession(request.SessionId);
            if (!session.Documents.TryGetValue(request.DocumentName, out FormInstance formInstance))
                throw new ArgumentException($"Flow session document '{request.DocumentName}' was not found.");

            List<string> usedUploadTokens = new List<string>();
            try
            {
                HydrateSessionFiles(session, request.RelatedGrid, usedUploadTokens);
                FormManager formManager = new FormManager(_serviceAPI);
                formManager.AppendRelatedGridRows(formInstance, request.RelatedGrid);
            }
            finally
            {
                foreach (string uploadToken in usedUploadTokens.Distinct())
                    CleanupSessionFile(session, uploadToken);
            }

            int appendedRows = request.RelatedGrid?.Rows?.Count ?? 0;
            return new { sessionId = request.SessionId, appendedRows };
        }

        public object UploadSessionFileChunk(UploadSessionFileChunkRequestModel request)
        {
            FlowTransferSession session = GetFlowSession(request.SessionId);
            if (!Guid.TryParseExact(request.UploadToken, "N", out _))
                throw new ArgumentException("UploadToken must be a GUID in N format.");
            if (request.Data == null || request.DataLength != request.Data.Length)
                throw new ArgumentException("Session file chunk data length mismatch.");
            if (request.ChunkStart < 0 || request.TotalEncodedLength <= 0 || request.ChunkStart + request.DataLength > request.TotalEncodedLength)
                throw new ArgumentException("Session file chunk range is invalid.");

            string uploadDirectory = Path.Combine(Path.GetTempPath(), "Systek_SynergyCSPRelay", "FlowSessions", request.SessionId);
            Directory.CreateDirectory(uploadDirectory);
            string uploadPath = Path.Combine(uploadDirectory, request.UploadToken + ".base64");
            byte[] chunkBytes = Encoding.ASCII.GetBytes(request.Data);

            using (var stream = new FileStream(uploadPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
            {
                if (request.ChunkStart == 0)
                    stream.SetLength(0);

                if (stream.Length == request.ChunkStart)
                {
                    stream.Seek(request.ChunkStart, SeekOrigin.Begin);
                    stream.Write(chunkBytes, 0, chunkBytes.Length);
                }
                else if (stream.Length != request.ChunkStart + chunkBytes.LongLength)
                {
                    throw new InvalidOperationException($"Session file chunk is out of sequence. Expected start {stream.Length}, received {request.ChunkStart}.");
                }
            }

            long receivedLength = new FileInfo(uploadPath).Length;
            bool completed = receivedLength == request.TotalEncodedLength;
            session.UploadedFiles[request.UploadToken] = new SessionFileUpload
            {
                FilePath = uploadPath,
                EncodedLength = request.TotalEncodedLength
            };

            return new
            {
                sessionId = request.SessionId,
                uploadToken = request.UploadToken,
                receivedLength,
                completed
            };
        }

        public SaveFlowResultModel FinalizeFlowSession(FinalizeFlowSessionRequestModel request)
        {
            FlowTransferSession session = GetFlowSession(request.SessionId);
            try
            {
                if(session.FlowParameters != null)
                    foreach(var fp in session.FlowParameters)
                        session.FlowInstance.Variables[fp.Key] = fp.Value;

                var saveResult = session.FlowInstance.SaveAndContinue().Result;
                return new SaveFlowResultModel
                {
                    Status = ResultStatus.Success,
                    SaveResponse = saveResult
                };
            }
            finally
            {
                FlowSessions.TryRemove(request.SessionId, out _);
                CleanupSessionFiles(session);
            }
        }

        private void HydrateSessionFiles(FlowTransferSession session, RelatedGridModel relatedGrid, List<string> usedUploadTokens)
        {
            foreach (RelatedGridRowModel row in relatedGrid?.Rows ?? new List<RelatedGridRowModel>())
            {
                foreach (RelatedDocumentsModel relatedDocuments in row.FormFields?.RelatedDocuments ?? new List<RelatedDocumentsModel>())
                {
                    foreach (RelatedDocumentsItemModel item in relatedDocuments.Items ?? new List<RelatedDocumentsItemModel>())
                    {
                        if (string.IsNullOrWhiteSpace(item.TransferFileToken))
                            continue;
                        if (!session.UploadedFiles.TryGetValue(item.TransferFileToken, out SessionFileUpload upload))
                            throw new ArgumentException($"Session file '{item.TransferFileToken}' was not found or is incomplete.");

                        usedUploadTokens.Add(item.TransferFileToken);
                        string encodedData = File.ReadAllText(upload.FilePath, Encoding.ASCII);
                        if (encodedData.Length != upload.EncodedLength)
                            throw new InvalidOperationException($"Session file '{item.TransferFileToken}' length mismatch.");
                        item.Data = encodedData;
                    }
                }

                foreach (RelatedGridModel nestedGrid in row.FormFields?.RelatedGrids ?? new List<RelatedGridModel>())
                    HydrateSessionFiles(session, nestedGrid, usedUploadTokens);
            }
        }

        private FlowTransferSession GetFlowSession(string sessionId)
        {
            if (string.IsNullOrWhiteSpace(sessionId) || !FlowSessions.TryGetValue(sessionId, out FlowTransferSession session))
                throw new ArgumentException("Transfer session was not found or expired.");

            if (DateTime.UtcNow - session.LastAccessAt > SessionTtl)
            {
                FlowSessions.TryRemove(sessionId, out _);
                CleanupSessionFiles(session);
                throw new ArgumentException("Transfer session expired.");
            }

            session.LastAccessAt = DateTime.UtcNow;
            return session;
        }

        private void CleanupExpiredSessions()
        {
            DateTime now = DateTime.UtcNow;
            foreach (var item in FlowSessions.Where(item => now - item.Value.LastAccessAt > SessionTtl).ToList())
            {
                if (FlowSessions.TryRemove(item.Key, out FlowTransferSession expiredSession))
                    CleanupSessionFiles(expiredSession);
            }
        }

        private static void CleanupSessionFiles(FlowTransferSession session)
        {
            foreach (string uploadToken in session.UploadedFiles.Keys.ToList())
                CleanupSessionFile(session, uploadToken);
        }

        private static void CleanupSessionFile(FlowTransferSession session, string uploadToken)
        {
            if (!session.UploadedFiles.TryGetValue(uploadToken, out SessionFileUpload upload))
                return;

            session.UploadedFiles.Remove(uploadToken);
            try
            {
                if (File.Exists(upload.FilePath))
                    File.Delete(upload.FilePath);
                string directory = Path.GetDirectoryName(upload.FilePath);
                if (Directory.Exists(directory) && !Directory.EnumerateFileSystemEntries(directory).Any())
                    Directory.Delete(directory);
            }
            catch
            {
                // Cleanup failure must not hide the transfer result.
            }
        }

        private class FlowTransferSession
        {
            public DateTime CreatedAt { get; set; }
            public DateTime LastAccessAt { get; set; }
            public dynamic FlowInstance { get; set; }
            public Dictionary<string, object> FlowParameters { get; set; }
            public Dictionary<string, FormInstance> Documents { get; set; }
            public Dictionary<string, SessionFileUpload> UploadedFiles { get; set; }
        }

        private class SessionFileUpload
        {
            public string FilePath { get; set; }
            public long EncodedLength { get; set; }
        }
    }
}
