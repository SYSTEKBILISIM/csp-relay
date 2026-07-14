using System.Collections.Generic;

namespace Ataven.Models
{
    public class InlineGridModel
    {
        public string FieldName { get; set; }
        public string WriteMode { get; set; } = "Append";
        public List<InlineGridRowModel> Rows { get; set; }
    }
}
