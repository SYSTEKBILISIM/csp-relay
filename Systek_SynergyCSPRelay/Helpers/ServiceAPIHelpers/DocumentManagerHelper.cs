using Bimser.Framework.Domain.Option;
using Bimser.Framework.Domain.Option.Pagination;
using Bimser.Framework.Web.Models;
using Bimser.Synergy.Entities.DocumentManagement.Business.DTOs.Requests;
using Bimser.Synergy.Entities.DocumentManagement.Business.DTOs.Responses;
using Bimser.Synergy.Entities.DocumentManagement.Business.Objects;
using Bimser.Synergy.Entities.DocumentManagement.Business.Secrets;
using Bimser.Synergy.Entities.Authentication.Business.DTOs.Requests;
using Bimser.Synergy.ServiceAPI;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Bimser.Framework.Json;
using Bimser.Framework.Extensions;

namespace Ataven.Helpers.ServiceAPIHelpers
{
    public class DocumentManagementHelper : ServiceAPIHelperBase
    {
        private ServiceAPI ServiceAPI { get; set; }
        private List<string> AllLanguages { get; set; }
        private string CurrentLanguage { get; set; }
        public DocumentManagementHelper(ServiceAPI ServiceAPI)
        {
            this.ServiceAPI = ServiceAPI;
            this.CurrentLanguage = ServiceAPI.HumanResources.GetCurrentUserInfo().Result.Result.Info.Language;
            this.AllLanguages = ServiceAPI.Authentication.GetLoginParametersAsync(new GetLoginParametersRequest(ServiceAPIConnector.DomainAddress, "WebInterface")).Result.Result.LanguageProperties.Languages.Select(s => s.Culture).ToList();
        }

        public async Task<ServiceAPIHelpersResponse<List<GetDMObjectResponse>>> GetObjectsFromPath(string filePath)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                return (await ServiceAPI.DocumentManagement.GetDMObjectsFromPath(new GetDMObjectsFromPathRequest(filePath))).Result.Items;
            });
        }

        public async Task<ServiceAPIHelpersResponse<GetDMObjectResponse>> GetFileFromSecretKey(string secretKey)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                return (await ServiceAPI.DocumentManagement.GetFile(secretKey)).Result;
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<Dictionary<long, string>>> GetObjectsPath(List<string> secretKeys)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                return (await ServiceAPI.DocumentManagement.GetPathsAsync(secretKeys)).Paths;
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<string>> GetDownloadUrlFromPath(string filePath, string language)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var getFile = GetObjectsFromPath(filePath).Result.Response.First();
                return (await ServiceAPI.DocumentManagement.GetDownloadUrl(getFile.SecretKey, language)).DownloadUrl;
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<string>> GetDownloadUrlFromSecretKey(string secretKey, string language)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                return (await ServiceAPI.DocumentManagement.GetDownloadUrl(secretKey, language)).DownloadUrl;
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<byte[]>> ReadObjectFromPath(string filePath, string language)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var getFile = GetObjectsFromPath(filePath).Result.Response.First();
                string downloadUrl = (await GetDownloadUrlFromSecretKey(getFile.SecretKey, language)).Response;
                return await ServiceAPI.DocumentManagement.DownloadAsync(downloadUrl);
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<byte[]>> ReadObjectFromSecretKey(string secretKey, string language)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                string downloadUrl = (await GetDownloadUrlFromSecretKey(secretKey, language)).Response;
                return await ServiceAPI.DocumentManagement.DownloadAsync(downloadUrl);
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<GetDMObjectResponse>> UploadDocument(string folderPath, string fileSecretKey, string contentType = "application/pdf")
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                GetDMObjectResponse getFile = (await GetFileFromSecretKey(fileSecretKey)).Response;
                byte[] data = ReadObjectFromSecretKey(fileSecretKey, this.CurrentLanguage).Result.Response;
                return CreateFile(getFile.Name, getFile.Description, data, folderPath, contentType).Result.Response;
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<GetDMObjectResponse>> CreateFile(string fileName, string fileDescription, byte[] data, string folderPath, string contentType = "application/pdf")
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var createFileName = this.AllLanguages.ToDictionary(lang => lang, lang => fileName);
                var createFileDescription = this.AllLanguages.ToDictionary(lang => lang, lang => fileDescription);
                var createFileResponse = await CreateFile(createFileName, createFileDescription, data, folderPath, contentType);
                return createFileResponse.Response;
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<GetDMObjectResponse>> CreateRepository(string repositoryName, string repositoryDescription)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var name = this.AllLanguages.ToDictionary(lang => lang, lang => repositoryName);
                var description = this.AllLanguages.ToDictionary(lang => lang, lang => repositoryDescription);
                var response = await CreateRepository(name, description);
                return response.Response;
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<GetDMObjectResponse>> CreateRepository(Dictionary<string, string> repositoryName, Dictionary<string, string> repositoryDescription)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var request = new CreateRepositoryRequest(repositoryName, repositoryDescription);
                var response = await ServiceAPI.DocumentManagement.CreateRepository(request);
                return response.Result;
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<GetDMObjectResponse>> CreateFolder(string folderName, string folderDescription, string parentFolderPath)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var name = this.AllLanguages.ToDictionary(lang => lang, lang => folderName);
                var description = this.AllLanguages.ToDictionary(lang => lang, lang => folderDescription);
                var result = await CreateFolder(name, description, parentFolderPath);
                return result.Response;
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<GetDMObjectResponse>> CreateFolder(Dictionary<string, string> folderName, Dictionary<string, string> folderDescription, string parentFolderPath)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var parentFolder = await ServiceAPI.DocumentManagement.GetDMObjectsFromPath(new GetDMObjectsFromPathRequest(parentFolderPath));
                var parent = parentFolder.Result.Items.FirstOrDefault() ?? throw new ArgumentException("Parent folder is not found to this return value.");
                var result = await ServiceAPI.DocumentManagement.CreateFolderAsync(folderName, folderDescription, parent.SecretKey);
                return result;
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<bool>> CreateFolderTree(string folderPath)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var treePaths = folderPath.Split("/");
                var treeList = BuildPathHierarchy(treePaths);
                var existingFoldersResponse = await ServiceAPI.DocumentManagement.GetDMObjectsFromPaths(new GetDMObjectsFromPathsRequest(treeList));
                var existingItems = existingFoldersResponse.Result.Items;
                if (!existingItems.Any())
                {
                    var rootName = treePaths[0];
                    var createRepositoryResponse = await CreateRepository(rootName, rootName);
                    if (!createRepositoryResponse.Success)
                        throw new Exception($"Failed to create {rootName} library. Exception: " + JsonConvert.SerializeObject(createRepositoryResponse.Exception));
                }
                for (int i = existingItems.Count() == 0 ? 1 : existingItems.Count; i < treeList.Count; i++)
                {
                    var fullPath = treeList[i];
                    var folderName = treePaths[i];
                    var parentPath = string.Join("/", treePaths.Take(i));
                    var createFolderResponse = await CreateFolder(folderName, folderName, parentPath);
                    if (!createFolderResponse.Success)
                        throw new Exception($"Failed to create {folderName} folder. Exception: " + JsonConvert.SerializeObject(createFolderResponse.Exception));
                }
                return true;
            });
        }
        
        private static List<string> BuildPathHierarchy(string[] segments)
        {
            var result = new List<string>();
            foreach (var segment in segments)
            {
                if (result.Any())
                    result.Add($"{result.Last()}/{segment}");
                else
                    result.Add(segment);
            }
            return result;
        }
        public async Task<ServiceAPIHelpersResponse<GetDMObjectResponse>> CreateFile(Dictionary<string, string> fileName, Dictionary<string, string> fileDescription, byte[] data, string folderPath, string contentType = "application/pdf")
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                WrapResponse<GetDMObjectsResponse> folders = await ServiceAPI.DocumentManagement.GetDMObjectsFromPath(new GetDMObjectsFromPathRequest(folderPath));
                if (!folders.Success)
                    throw new ArgumentException("The folder path request failed.");
                
                GetDMObjectsResponse getDMObjectResponse = folders.Result;
                if (getDMObjectResponse.Items?.Count == 0)
                    throw new ArgumentException("The specified folder could not be found.");
                string secretkey = getDMObjectResponse.Items.First().SecretKey;
                FileContentInfo fileContentInfo = new(contentType, data.LongLength);
                CreateFileRequest createFileRequest = new(secretkey, fileContentInfo, fileName, fileDescription, null, null);
                WrapResponse<GetDMObjectResponse> createFileResponse = await ServiceAPI.DocumentManagement.CreateFile(createFileRequest);
                if (!createFileResponse.Success)
                    throw new Exception("Request to create file failed");
                string fileSecretKey = createFileResponse.Result.SecretKey;
                WrapResponse<GetUploadPartsResponse> uploadParts = await ServiceAPI.DocumentManagement.GetUploadParts(new GetUploadPartsRequest(fileSecretKey, null, data.LongLength));
                var uplaodPartsResponse = ServiceAPI.DocumentManagement.Upload(data, contentType, uploadParts.Result.UploadParts);
                if(!uplaodPartsResponse)
                    throw new Exception("Request to upload parts failed");
                return createFileResponse.Result;
            });
        }

        public async Task<ServiceAPIHelpersResponse<CreateFilePartsResponse>> CreateFileParts(string fileName, string fileDescription, long dataLength, string folderPath, string contentType = "application/pdf")
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var name = this.AllLanguages.ToDictionary(lang => lang, lang => fileName);
                var description = this.AllLanguages.ToDictionary(lang => lang, lang => fileDescription);

                WrapResponse<GetDMObjectsResponse> folders = await ServiceAPI.DocumentManagement.GetDMObjectsFromPath(new GetDMObjectsFromPathRequest(folderPath));
                if (!folders.Success)
                    throw new ArgumentException("The folder path request failed.");

                GetDMObjectsResponse getDMObjectResponse = folders.Result;
                if (getDMObjectResponse.Items?.Count == 0)
                    throw new ArgumentException("The specified folder could not be found.");
                string secretkey = getDMObjectResponse.Items.First().SecretKey;
                FileContentInfo fileContentInfo = new(contentType, dataLength);
                CreateFileRequest createFileRequest = new(secretkey, fileContentInfo, name, description, null, null);
                GetDMObjectResponse createFileResponse = ServiceAPI.DocumentManagement.CreateFile(createFileRequest).Result.Result;
                WrapResponse<GetUploadPartsResponse> uploadParts = await ServiceAPI.DocumentManagement.GetUploadParts(new GetUploadPartsRequest(createFileResponse.SecretKey, null, dataLength));
                return new CreateFilePartsResponse() { FileSecretKey = createFileResponse.SecretKey, UploadParts = uploadParts.Result.UploadParts };
            });
        }

        public class CreateFilePartsResponse {
            public string FileSecretKey { get; set; }
            public List<UploadPart> UploadParts { get; set; }
        }

        public async Task<ServiceAPIHelpersResponse<bool>> UploadPartsFromSecretKey(List<UploadPart> uploadParts, byte[] data, string contentType = "application/pdf")
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var uploadPartsResponse = ServiceAPI.DocumentManagement.Upload(data, contentType, uploadParts);
                if (!uploadPartsResponse)
                {
                    string ranges = uploadParts == null
                        ? "null"
                        : string.Join(", ", uploadParts.Select(part => $"#{part.Id}:{part.StartByte}-{part.EndByte}"));
                    throw new Exception($"Request to upload parts failed. DataBytes={data?.LongLength ?? 0}, ContentType={contentType}, Parts=[{ranges}]");
                }
                return uploadPartsResponse;
            });
        }

        public async Task<ServiceAPIHelpersResponse<bool>> DeleteDocumentFromPath(string path, string reason = null)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                WrapResponse<GetDMObjectsResponse> files = await ServiceAPI.DocumentManagement.GetDMObjectsFromPath(new GetDMObjectsFromPathRequest(path));
                if (!files.Success)
                    throw new ArgumentException("The folder path request failed.");
                GetDMObjectsResponse getDMObjectResponse = files.Result;
                if (getDMObjectResponse.Items?.Count == 0)
                    throw new ArgumentException("The specified folder could not be found.");
                
                var secretKeys = getDMObjectResponse.Items;
                var deleteFilesRequest = new DeleteFilesRequest(new List<DeleteFileRequest>(secretKeys.Select(t => new DeleteFileRequest(t.SecretKey, reason))), reason);
                WrapResponse<bool> deleteFileResult = ServiceAPI.DocumentManagement.DeleteFiles(deleteFilesRequest).Result;
                return deleteFileResult.Result;
            });
        }
        
        public async Task<ServiceAPIHelpersResponse<bool>> DeleteDocumentFromSecretKey(string secretKey, string reason = null)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var deleteFileRequest = new DeleteFileRequest(secretKey, reason);
                WrapResponse<bool> deleteFileResult = await ServiceAPI.DocumentManagement.DeleteFile(deleteFileRequest);
                return deleteFileResult.Result;
            });
        }
        public async Task<ServiceAPIHelpersResponse<bool>> RenameObject(string path, string newName)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var name = this.AllLanguages.ToDictionary(lang => lang, lang => newName);
                return (await RenameObject(path, name)).Response;
            });
        }
        public async Task<ServiceAPIHelpersResponse<bool>> RenameObject(string path, Dictionary<string, string> newName)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var dmObjectResponse = await ServiceAPI.DocumentManagement.GetDMObjectsFromPath(new GetDMObjectsFromPathRequest(path));
                var dmObject = dmObjectResponse.Result.Items.First();
                var dmObjectSecret = new DMObjectSecret(dmObject.Id, (int)dmObject.Type, ServiceAPI.GetToken());
                var renameRequest = new RenameObjectRequest(dmObject.SecretKey, dmObject.VersionSecretKey, dmObjectSecret)
                {
                    NameML = newName
                };
                var result = await ServiceAPI.DocumentManagement.RenameObject(renameRequest);
                return result.Result;
            });
        }
        public async Task<ServiceAPIHelpersResponse<GetDMContentObjectsResponse>> CreateVersion(string path, string newFileSecretKey, string commitMessage)
        {
            return await ExecuteWithHandlingAsync<GetDMContentObjectsResponse>(async () =>
            {
                var getFileResponse = await ServiceAPI.DocumentManagement.GetFile(newFileSecretKey);
                if (getFileResponse?.Result == null)
                    throw new Exception("Failed to retrieve file information.");
                var fileName = getFileResponse.Result.Name?.FirstOrDefault().Value;
                if (string.IsNullOrWhiteSpace(fileName))
                    throw new Exception("File name is missing.");
                var downloadUrlResponse = await ServiceAPI.DocumentManagement.GetDownloadUrl(newFileSecretKey, fileName);
                if (string.IsNullOrWhiteSpace(downloadUrlResponse?.DownloadUrl))
                    throw new Exception("Failed to retrieve download URL.");
                var data = await ServiceAPI.DocumentManagement.DownloadAsync(downloadUrlResponse.DownloadUrl);
                if (data == null || data.Length == 0)
                    throw new Exception("Downloaded file is empty.");
                var versionResponse = await CreateVersionWithByteArray(path, data, commitMessage);
                if (versionResponse?.Response == null)
                    throw new Exception("Failed to create version from byte array.");
                return versionResponse.Response;
            });
        }

        public async Task<ServiceAPIHelpersResponse<GetDMContentObjectsResponse>> CreateVersionWithByteArray(string path, byte[] data, string commitMessage)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var files = await ServiceAPI.DocumentManagement
                    .GetDMObjectsFromPath(new GetDMObjectsFromPathRequest(path));
                if (!files.Success || files.Result?.Items == null || files.Result.Items.Count == 0)
                    throw new Exception("File not found for the specified path.");
                string fileSecretKey = files.Result.Items[0].SecretKey;
                var loadOptions = new LoadOptions(null, null, new Pagination(0, 9999));
                var versions = GetVersionList(fileSecretKey);
                if (versions == null)
                    throw new Exception("Failed to retrieve version list.");
                var branch = CreateBranch(fileSecretKey, versions);
                if (branch == null)
                    throw new Exception("Failed to create branch.");
                var nc1 = GetContent(fileSecretKey, branch.SecretKey, loadOptions);
                if (nc1 == null)
                    throw new Exception("Failed to retrieve content from branch.");
                var commit = CreateCommit(data, commitMessage, branch, nc1);
                if (commit == null)
                    throw new Exception("Failed to create commit.");
                ServiceAPI.DocumentManagement.Upload(data, commit.UploadParts);
                var versionSuggestion = GetVersionSuggestion(fileSecretKey);
                if (versionSuggestion == null)
                    throw new Exception("Failed to retrieve version suggestion.");
                var completeBranchResponse = CompleteBranch(fileSecretKey, branch, versionSuggestion);
                if (completeBranchResponse == null)
                    throw new Exception("Failed to complete branch.");
                var nc2 = GetContent(fileSecretKey, completeBranchResponse.SecretKey, loadOptions);
                if (nc2 == null)
                    throw new Exception("Failed to retrieve final content.");
                return nc2;
            });
        }
        public GetVersionListResponse GetVersionList(string fileSecretKey)
        {
            var response = ServiceAPI.DocumentManagement.GetVersionList(new GetVersionListRequest(fileSecretKey)).Result;
            if (response.Success)
                return response.Result;
            else
                return null;
        }
        public GetVersionResponse CreateBranch(string fileSecretKey, GetVersionListResponse versions)
        {
            var response = ServiceAPI.DocumentManagement.CreateBranch(new CreateBranchRequest(fileSecretKey, versions.Items.First().SecretKey)).Result;
            if (response.Success)
                return response.Result;
            else
                return null;
        }
        public GetDMContentObjectsResponse GetContent(string fileSecretKey, string versionScretKey, LoadOptions loadOptions)
        {
            var response = ServiceAPI.DocumentManagement.GetContents(new GetContentsRequest(fileSecretKey, versionScretKey, loadOptions)).Result;
            if (response.Success)
                return response.Result;
            else
                return null;
        }
        public GetUploadPartsResponse CreateCommit(byte[] fileData, string commitMessage, GetVersionResponse branch, GetDMContentObjectsResponse nc1)
        {
            var response = ServiceAPI.DocumentManagement.CreateCommit(new CreateCommitRequest(nc1.Items.Last().SecretKey, branch.SecretKey, commitMessage, fileData.Length)).Result;
            if (response.Success)
                return response.Result;
            else
                return null;
        }
        public GetVersionResponse CompleteBranch(string fileSecretKey, GetVersionResponse branch, GetVersionSuggestionResponse versionSuggestion)
        {
            var response = ServiceAPI.DocumentManagement.CompleteBranch(new CompleteBranchRequest(fileSecretKey, branch.SecretKey, versionSuggestion.Major, versionSuggestion.Minor, DateTimeOffset.Now, true)).Result;
            if (response.Success)
                return response.Result;
            else
                return null;
        }
        public GetVersionSuggestionResponse GetVersionSuggestion(string fileSecretKey)
        {
            var response = ServiceAPI.DocumentManagement.GetVersionSuggestion(new GetVersionSuggestionRequest(fileSecretKey)).Result;
            if (response.Success)
                return response.Result;
            else
                return null;
        }
    }
}
