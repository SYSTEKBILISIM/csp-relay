using System.Collections.Generic;

namespace Ataven.Models
{
    public class InlineGridModel
    {
        public string FieldName { get; set; }
        public List<InlineGridRowModel> Rows { get; set; }
    }
}