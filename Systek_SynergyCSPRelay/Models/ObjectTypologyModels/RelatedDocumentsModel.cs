using System.Collections.Generic;

namespace Ataven.Models
{
    public class RelatedDocumentsModel
    {
        public string FieldName { get; set; }
        public List<RelatedDocumentsItemModel> Items { get; set; }
    }
}