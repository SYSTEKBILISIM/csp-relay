using Bimser.Framework.AspNetCore.Mvc.Attributes;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;
using Ataven.Helpers.ServiceAPIHelpers;
using Ataven.Managers;
using Ataven.Models;
using System;
using Bimser.Framework.Json;
using Newtonsoft.Json.Linq;
using Bimser.Synergy.Entities.Authentication.Business.DTOs.Requests;

namespace Systek_SynergyCSPRelay.Controllers
{
    [Route("apps/Systek_SynergyCSPRelay/latest/api/Transfer/[action]")]
    [Route("apps/Systek_SynergyCSPRelay/{v:int:min(1)}/api/Transfer/[action]")]
    [Route("api/Transfer/[action]")]
    [Produces("application/json")]
    public class TransferController : Controller
    {
        [HttpGet]
        [ActionName("Ping")]
        [NoRequestHeaders]
        [NoResponseHeaders]
        public string Ping()
        {
            return "TransferController API Controller is ok";
        }

        [HttpPost]
        [ActionName("Capabilities")]
        [NoRequestHeaders]
        [NoResponseHeaders]
        public IActionResult Capabilities()
        {
            return Ok(new { UniqueGridColumns = true });
        }

        [HttpPost]
        [ActionName("CreateFlow")]
        [NoRequestHeaders]
        [NoResponseHeaders]
        public Task<IActionResult> CreateFlow([FromBody] CreateFlowRequestModel request)
        {
            try
            {
                var headers = Request.Headers.ToJsonString().ToObject<JObject>();
                var token = headers["Authorization"][0].ToString().Split(" ")[1];
                var encryptedData = Request.Headers["bimser-encrypted-data"][0].ToString();
                var language = Request.Headers["bimser-language"][0].ToString();
                var serviceAPI = ServiceAPIConnector.Create(token, encryptedData, language);
                if(request.LoginAs != null) {
                    var getUser = serviceAPI.HumanResources.GetUserByUserName(request.LoginAs).Result.Result;
                    var loginAs = serviceAPI.Authentication.LoginAs(new LoginAsRequest(getUser.Id.Value, getUser.Username.Value)).Result.Result;
                }
                var workflowManager = new WorkflowManager(serviceAPI);
                var createFlowResponse = workflowManager.CreateAndSave(request).Result;
                return Task.FromResult<IActionResult>(Ok(createFlowResponse));
            }
            catch (Exception ex)
            {
                return Task.FromResult<IActionResult>(BadRequest(ex));
            }
        }

        [HttpPost]
        [ActionName("BeginFlowSession")]
        [NoRequestHeaders]
        [NoResponseHeaders]
        public Task<IActionResult> BeginFlowSession([FromBody] BeginFlowSessionRequestModel request)
        {
            try
            {
                var serviceAPI = CreateServiceAPIFromHeaders();
                var sessionManager = new TransferSessionManager(serviceAPI);
                var response = sessionManager.BeginFlowSession(request);
                return Task.FromResult<IActionResult>(Ok(response));
            }
            catch (Exception ex)
            {
                return Task.FromResult<IActionResult>(BadRequest(ex));
            }
        }

        [HttpPost]
        [ActionName("AppendRelatedGridRows")]
        [NoRequestHeaders]
        [NoResponseHeaders]
        public Task<IActionResult> AppendRelatedGridRows([FromBody] AppendRelatedGridRowsRequestModel request)
        {
            try
            {
                var serviceAPI = CreateServiceAPIFromHeaders();
                var sessionManager = new TransferSessionManager(serviceAPI);
                var response = sessionManager.AppendRelatedGridRows(request);
                return Task.FromResult<IActionResult>(Ok(response));
            }
            catch (Exception ex)
            {
                return Task.FromResult<IActionResult>(BadRequest(ex));
            }
        }

        [HttpPost]
        [ActionName("FinalizeFlowSession")]
        [NoRequestHeaders]
        [NoResponseHeaders]
        public Task<IActionResult> FinalizeFlowSession([FromBody] FinalizeFlowSessionRequestModel request)
        {
            try
            {
                var serviceAPI = CreateServiceAPIFromHeaders();
                var sessionManager = new TransferSessionManager(serviceAPI);
                var response = sessionManager.FinalizeFlowSession(request);
                return Task.FromResult<IActionResult>(Ok(response));
            }
            catch (Exception ex)
            {
                return Task.FromResult<IActionResult>(BadRequest(ex));
            }
        }

        [HttpPost]
        [ActionName("CreateForm")]
        [NoRequestHeaders]
        [NoResponseHeaders]
        public Task<IActionResult> CreateForm([FromBody] CreateFormRequestModel request)
        {
            try
            {
                var headers = Request.Headers.ToJsonString().ToObject<JObject>();
                var token = headers["Authorization"][0].ToString().Split(" ")[1];
                var encryptedData = Request.Headers["bimser-encrypted-data"][0].ToString();
                var language = Request.Headers["bimser-language"][0].ToString();
                var serviceAPI = ServiceAPIConnector.Create(token, encryptedData, language);
                if(request.LoginAs != null) {
                    var getUser = serviceAPI.HumanResources.GetUserByUserName(request.LoginAs).Result.Result;
                    var loginAs = serviceAPI.Authentication.LoginAs(new LoginAsRequest(getUser.Id.Value, getUser.Username.Value)).Result.Result;
                    serviceAPI = ServiceAPIConnector.Create(loginAs.Token, encryptedData, language);
                }
                var formManager = new FormManager(serviceAPI);
                var createFormResponse = formManager.CreateAndSave(request).Result;
                return Task.FromResult<IActionResult>(Ok(createFormResponse));
            }
            catch (Exception ex)
            {
                return Task.FromResult<IActionResult>(BadRequest(ex));
            }
        }
        
        [HttpPost]
        [ActionName("EditForm")]
        [NoRequestHeaders]
        [NoResponseHeaders]
        public Task<IActionResult> EditForm([FromBody] EditFormRequestModel request)
        {
            try
            {
                var headers = Request.Headers.ToJsonString().ToObject<JObject>();
                var token = headers["Authorization"][0].ToString().Split(" ")[1];
                var encryptedData = Request.Headers["bimser-encrypted-data"][0].ToString();
                var language = Request.Headers["bimser-language"][0].ToString();
                var serviceAPI = ServiceAPIConnector.Create(token, encryptedData, language);
                if(request.LoginAs != null) {
                    var getUser = serviceAPI.HumanResources.GetUserByUserName(request.LoginAs).Result.Result;
                    var loginAs = serviceAPI.Authentication.LoginAs(new LoginAsRequest(getUser.Id.Value, getUser.Username.Value)).Result.Result;
                }
                var formManager = new FormManager(serviceAPI);
                var editFormResponse = formManager.EditAndSave(request).Result;
                return Task.FromResult<IActionResult>(Ok(editFormResponse));
            }
            catch (Exception ex)
            {
                return Task.FromResult<IActionResult>(BadRequest(ex));
            }
        }

        [HttpPost]
        [ActionName("CreateFileParts")]
        [NoRequestHeaders]
        [NoResponseHeaders]
        public Task<IActionResult> CreateFileParts([FromBody] CreateFilePartsRequestModel request)
        {
            try
            {
                var headers = Request.Headers.ToJsonString().ToObject<JObject>();
                var token = headers["Authorization"][0].ToString().Split(" ")[1];
                var encryptedData = Request.Headers["bimser-encrypted-data"][0].ToString();
                var language = Request.Headers["bimser-language"][0].ToString();
                var serviceAPI = ServiceAPIConnector.Create(token, encryptedData, language);
                var documentManager = new DocumentManager(serviceAPI);
                var createFileResponse = documentManager.CreateFileParts(request).Result;
                return Task.FromResult<IActionResult>(Ok(createFileResponse));
            }
            catch (Exception ex)
            {
                return Task.FromResult<IActionResult>(BadRequest(ex));
            }
        }

        [HttpPost]
        [ActionName("UploadFileParts")]
        [NoRequestHeaders]
        [NoResponseHeaders]
        public Task<IActionResult> UploadFileParts([FromBody] UploadFilePartsRequestModel request)
        {
            try
            {
                var headers = Request.Headers.ToJsonString().ToObject<JObject>();
                var token = headers["Authorization"][0].ToString().Split(" ")[1];
                var encryptedData = Request.Headers["bimser-encrypted-data"][0].ToString();
                var language = Request.Headers["bimser-language"][0].ToString();
                var serviceAPI = ServiceAPIConnector.Create(token, encryptedData, language);
                var documentManager = new DocumentManager(serviceAPI);
                var createFileResponse = documentManager.UploadFileParts(request).Result;
                return Task.FromResult<IActionResult>(Ok(createFileResponse));
            }
            catch (Exception ex)
            {
                return Task.FromResult<IActionResult>(BadRequest(new
                {
                    message = ex.Message,
                    exceptionType = ex.GetType().FullName,
                    innerMessage = ex.InnerException?.Message
                }));
            }
        }

        private Bimser.Synergy.ServiceAPI.ServiceAPI CreateServiceAPIFromHeaders()
        {
            var headers = Request.Headers.ToJsonString().ToObject<JObject>();
            var token = headers["Authorization"][0].ToString().Split(" ")[1];
            var encryptedData = Request.Headers["bimser-encrypted-data"][0].ToString();
            var language = Request.Headers["bimser-language"][0].ToString();
            return ServiceAPIConnector.Create(token, encryptedData, language);
        }
    }
}
