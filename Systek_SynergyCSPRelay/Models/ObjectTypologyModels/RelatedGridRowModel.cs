using System.Collections.Generic;

namespace Ataven.Models
{
    public class RelatedGridRowModel
    {
        public long RelationDocumentId { get; set; } = 0;
        public Dictionary<string, object>? FormParameters { get; set; }
        public FormFieldsModel FormFields { get; set; }
    }
}