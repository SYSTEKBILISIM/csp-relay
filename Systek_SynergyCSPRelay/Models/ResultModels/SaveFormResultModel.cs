using Ataven.Enums;
using Bimser.Synergy.Entities.FormDesigner.Runtime.Models.Controller;

namespace Ataven.Models
{
    public class SaveFormResultModel
    {
        public ResultStatus Status { get; set; }
        public FormSaveResponse SaveResponse { get; set; }
    }
}