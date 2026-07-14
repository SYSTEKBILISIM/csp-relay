using System.Threading.Tasks;
using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Ataven.Helpers.ServiceAPIHelpers;
using Ataven.Models;
using Bimser.Synergy.ServiceAPI;
using Bimser.Synergy.Entities.DocumentManagement.Business.DTOs.Responses;
using static Ataven.Helpers.ServiceAPIHelpers.DocumentManagementHelper;

namespace Ataven.Managers
{
    public class DocumentManager
    {
        private readonly ServiceAPI _serviceAPI;

        public DocumentManager(ServiceAPI serviceAPI)
        {
            _serviceAPI = serviceAPI;
        }

        public Task<GetDMObjectResponse> CreateFile(CreateFileRequestModel request)
        {
            DocumentManagementHelper documentManagementHelper = _serviceAPI.GetHelperInstance<DocumentManagementHelper>();
            string targetPath = EnsureFolderPath(documentManagementHelper, request.Path);
            var createFileResult = documentManagementHelper.CreateFile(
                request.Name,
                request.Description ?? string.Empty,
                request.GetByteData(),
                targetPath,
                request.ContentType
            ).Result;
            return Task.FromResult(createFileResult.Response);
        }

        public Task<CreateFilePartsResponse> CreateFileParts(CreateFilePartsRequestModel request)
        {
            DocumentManagementHelper documentManagementHelper = _serviceAPI.GetHelperInstance<DocumentManagementHelper>();
            string targetPath = EnsureFolderPath(documentManagementHelper, request.Path);
            var createFileResult = documentManagementHelper.CreateFileParts(
                request.Name,
                request.Description ?? string.Empty,
                request.DataLength,
                targetPath,
                request.ContentType
            ).Result;
            return Task.FromResult(createFileResult.Response);
        }

        private static string EnsureFolderPath(DocumentManagementHelper documentManagementHelper, string path)
        {
            string normalizedPath = (path ?? string.Empty).Replace("\\", "/").Trim().Trim('/');
            if (string.IsNullOrWhiteSpace(normalizedPath))
                throw new ArgumentException("Document target path cannot be empty.");

            var createTreeResult = documentManagementHelper.CreateFolderTree(normalizedPath).Result;
            if (!createTreeResult.Success)
                throw new InvalidOperationException($"Document target path '{normalizedPath}' could not be created.", createTreeResult.Exception);

            return normalizedPath;
        }

        public Task<bool> UploadFileParts(UploadFilePartsRequestModel request)
        {
            DocumentManagementHelper documentManagementHelper = _serviceAPI.GetHelperInstance<DocumentManagementHelper>();
            byte[] data = request.GetByteData();

            if (request.DataLength.HasValue && request.DataLength.Value != data.LongLength)
                throw new ArgumentException($"UploadFileParts data length mismatch. Declared {request.DataLength.Value} bytes, received {data.LongLength} bytes.");

            if (IsChunkedUpload(request))
                return UploadFilePartsChunk(request, documentManagementHelper, data);

            long expectedBytes = request.UploadParts?.Sum(part => part.EndByte - part.StartByte + 1) ?? 0;

            if (request.UploadParts == null || request.UploadParts.Count == 0)
                throw new ArgumentException("UploadFileParts request must include at least one UploadPart.");

            if (expectedBytes > 0 && data.LongLength != expectedBytes)
                throw new ArgumentException($"UploadFileParts data length mismatch. Expected {expectedBytes} bytes from UploadParts, received {data.LongLength} bytes.");

            var uploadFilePartsResponse = documentManagementHelper.UploadPartsFromSecretKey(
                request.UploadParts,
                data,
                request.ContentType
            ).Result;

            if (!uploadFilePartsResponse.Success)
            {
                string ranges = string.Join(", ", request.UploadParts.Select(part => $"#{part.Id}:{part.StartByte}-{part.EndByte}"));
                string innerMessage = uploadFilePartsResponse.Exception?.Message ?? "Unknown upload error";
                throw new InvalidOperationException($"UploadFileParts failed. DataBytes={data.LongLength}, ContentType={request.ContentType}, Parts=[{ranges}]. {innerMessage}", uploadFilePartsResponse.Exception);
            }

            return Task.FromResult(uploadFilePartsResponse.Response);
        }

        private static bool IsChunkedUpload(UploadFilePartsRequestModel request)
        {
            return !string.IsNullOrWhiteSpace(request.FileSecretKey)
                && request.ChunkStartByte.HasValue
                && request.TotalFileBytes.HasValue;
        }

        private Task<bool> UploadFilePartsChunk(UploadFilePartsRequestModel request, DocumentManagementHelper documentManagementHelper, byte[] data)
        {
            if (request.UploadParts == null || request.UploadParts.Count == 0)
                throw new ArgumentException("Chunked UploadFileParts request must include the full UploadParts list.");

            if (request.TotalFileBytes.Value <= 0)
                throw new ArgumentException("Chunked UploadFileParts request must include a positive TotalFileBytes value.");

            if (request.ChunkStartByte.Value < 0 || request.ChunkStartByte.Value + data.LongLength > request.TotalFileBytes.Value)
                throw new ArgumentException($"Invalid chunk range. ChunkStartByte={request.ChunkStartByte.Value}, DataBytes={data.LongLength}, TotalFileBytes={request.TotalFileBytes.Value}.");

            string tempPath = GetUploadTempPath(request.FileSecretKey);
            Directory.CreateDirectory(Path.GetDirectoryName(tempPath));

            using (var stream = new FileStream(tempPath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.None))
            {
                if (request.ChunkStartByte.Value == 0)
                    stream.SetLength(0);

                stream.Seek(request.ChunkStartByte.Value, SeekOrigin.Begin);
                stream.Write(data, 0, data.Length);
            }

            FileInfo fileInfo = new FileInfo(tempPath);
            if (fileInfo.Length < request.TotalFileBytes.Value)
                return Task.FromResult(true);

            byte[] fullData = File.ReadAllBytes(tempPath);
            if (fullData.LongLength != request.TotalFileBytes.Value)
                throw new InvalidOperationException($"Chunked UploadFileParts temp file length mismatch. Expected {request.TotalFileBytes.Value} bytes, found {fullData.LongLength} bytes.");

            long expectedBytes = request.UploadParts.Sum(part => part.EndByte - part.StartByte + 1);
            if (expectedBytes != fullData.LongLength)
                throw new ArgumentException($"UploadFileParts full data length mismatch. Expected {expectedBytes} bytes from UploadParts, received {fullData.LongLength} bytes.");

            var uploadFilePartsResponse = documentManagementHelper.UploadPartsFromSecretKey(
                request.UploadParts,
                fullData,
                request.ContentType
            ).Result;

            if (!uploadFilePartsResponse.Success)
            {
                string ranges = string.Join(", ", request.UploadParts.Select(part => $"#{part.Id}:{part.StartByte}-{part.EndByte}"));
                string innerMessage = uploadFilePartsResponse.Exception?.Message ?? "Unknown upload error";
                throw new InvalidOperationException($"UploadFileParts failed after chunk assembly. DataBytes={fullData.LongLength}, ContentType={request.ContentType}, Parts=[{ranges}]. {innerMessage}", uploadFilePartsResponse.Exception);
            }

            File.Delete(tempPath);
            return Task.FromResult(uploadFilePartsResponse.Response);
        }

        private static string GetUploadTempPath(string fileSecretKey)
        {
            string safeKey = Regex.Replace(fileSecretKey, @"[^a-zA-Z0-9_-]", "_");
            return Path.Combine(Path.GetTempPath(), "Systek_SynergyCSPRelay", "UploadFileParts", safeKey + ".bin");
        }
    }
}
