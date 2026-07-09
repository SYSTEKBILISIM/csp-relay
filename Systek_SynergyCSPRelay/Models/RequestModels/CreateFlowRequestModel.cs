using System.Collections.Generic;

namespace Ataven.Models
{
    public class CreateFlowRequestModel
    {
        public string ProjectName { get; set; }
        public string FlowName { get; set; }
        public int StartingEvent { get; set; }
        public string? LoginAs { get; set; }
        public Dictionary<string, object>? FlowParameters { get; set; }
        public List<FlowDocumentModel> FlowDocuments { get; set; }
    }
}