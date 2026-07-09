using System.Collections.Generic;

namespace Ataven.Models
{
    public class RelatedGridModel
    {
        public string FieldName { get; set; }
        public string ProjectName { get; set; }
        public string FormName { get; set; }
        public string DocumentIdColumnName { get; set; }
        public List<RelatedGridRowModel> Rows { get; set; }
    }
}