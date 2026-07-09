using System.Threading.Tasks;
using Ataven.Enums;
using Ataven.Models;
using Bimser.Framework.Json;
using Bimser.Synergy.ServiceAPI;

namespace Ataven.Managers
{
    public class WorkflowManager
    {
        private readonly ServiceAPI _serviceAPI;

        public WorkflowManager(ServiceAPI serviceAPI)
        {
            _serviceAPI = serviceAPI;
        }

        public async Task<SaveFlowResultModel> CreateAndSave(CreateFlowRequestModel request)
        {
            var createFlow = _serviceAPI.WorkflowManager.Create(request.ProjectName, request.FlowName, 0).Result;
            createFlow.StartingEvent = createFlow.Events[request.StartingEvent];
            foreach(FlowDocumentModel fd in request.FlowDocuments) {
                var formInstance = createFlow.Documents[fd.DocumentName].FormInstance;
                FormManager formManager = new FormManager(_serviceAPI);
                SaveFormResultModel formResult = formManager.SaveForm(formInstance, fd.FormFields, fd.FormParameters).Result;
            }

            if(request.FlowParameters != null)
                foreach(var fp in request.FlowParameters)
                    createFlow.Variables[fp.Key] = fp.Value;
            
            var createFlowSaveResult = createFlow.SaveAndContinue().Result;
            return new() {
                Status = ResultStatus.Success,
                SaveResponse = createFlowSaveResult
            };
        }
    }
}