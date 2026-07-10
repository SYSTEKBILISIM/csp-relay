using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
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
                Documents = documents
            };

            return new BeginSessionResultModel { SessionId = sessionId };
        }

        public object AppendRelatedGridRows(AppendRelatedGridRowsRequestModel request)
        {
            FlowTransferSession session = GetFlowSession(request.SessionId);
            if (!session.Documents.TryGetValue(request.DocumentName, out FormInstance formInstance))
                throw new ArgumentException($"Flow session document '{request.DocumentName}' was not found.");

            FormManager formManager = new FormManager(_serviceAPI);
            formManager.AppendRelatedGridRows(formInstance, request.RelatedGrid);

            int appendedRows = request.RelatedGrid?.Rows?.Count ?? 0;
            return new { sessionId = request.SessionId, appendedRows };
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
            }
        }

        private FlowTransferSession GetFlowSession(string sessionId)
        {
            if (string.IsNullOrWhiteSpace(sessionId) || !FlowSessions.TryGetValue(sessionId, out FlowTransferSession session))
                throw new ArgumentException("Transfer session was not found or expired.");

            if (DateTime.UtcNow - session.LastAccessAt > SessionTtl)
            {
                FlowSessions.TryRemove(sessionId, out _);
                throw new ArgumentException("Transfer session expired.");
            }

            session.LastAccessAt = DateTime.UtcNow;
            return session;
        }

        private void CleanupExpiredSessions()
        {
            DateTime now = DateTime.UtcNow;
            foreach (var item in FlowSessions.Where(item => now - item.Value.LastAccessAt > SessionTtl).ToList())
                FlowSessions.TryRemove(item.Key, out _);
        }

        private class FlowTransferSession
        {
            public DateTime CreatedAt { get; set; }
            public DateTime LastAccessAt { get; set; }
            public dynamic FlowInstance { get; set; }
            public Dictionary<string, object> FlowParameters { get; set; }
            public Dictionary<string, FormInstance> Documents { get; set; }
        }
    }
}
