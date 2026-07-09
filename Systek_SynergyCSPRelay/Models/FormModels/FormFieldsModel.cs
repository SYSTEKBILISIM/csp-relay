using System.Collections.Generic;

namespace Ataven.Models
{
    public class FormFieldsModel
    {
        public List<ObjectModel>? Objects { get; set; }
        public List<RelatedGridModel>? RelatedGrids { get; set; }
        public List<InlineGridModel>? InlineGrids { get; set; }
        public List<RelatedDocumentsModel>? RelatedDocuments { get; set; }
    }
}