using System.Collections.Generic;

namespace Ataven.Models
{
    public class InlineGridModel
    {
        public string FieldName { get; set; }
        public string WriteMode { get; set; } = "Append";
        public List<string> UniqueColumns { get; set; } = new List<string>();
        public List<string> CaseSensitiveUniqueColumns { get; set; } = new List<string>();
        public List<InlineGridRowModel> Rows { get; set; }
    }
}
