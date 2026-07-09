using System.Collections.Generic;

namespace Ataven.Models
{
    public class EditFormRequestModel
    {
        public string ProjectName { get; set; }
        public string FormName { get; set; }
        public long DocumentId { get; set; }
        public string? LoginAs { get; set; }
        public Dictionary<string, object>? FormParameters { get; set; }
        public FormFieldsModel FormFields { get; set; }
    }
}