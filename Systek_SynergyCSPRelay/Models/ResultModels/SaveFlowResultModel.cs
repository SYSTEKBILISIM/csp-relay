using Ataven.Enums;
using Bimser.Synergy.Entities.Workflow.Runtime.Models.Controller;

namespace Ataven.Models
{
    public class SaveFlowResultModel
    {
        public ResultStatus Status { get; set; }
        public FlowSaveAndContinueResponse SaveResponse { get; set; }
    }
}