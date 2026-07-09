using System.Collections.Generic;

namespace Ataven.Models
{
    public class FlowDocumentModel
    {
        public string DocumentName { get; set; }
        public Dictionary<string, object>? FormParameters { get; set; }
        public FormFieldsModel FormFields { get; set; }
    }
}