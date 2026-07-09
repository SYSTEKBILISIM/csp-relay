using System;

namespace Ataven.Models
{
    public class RelatedDocumentsItemModel
    {
        public string FileSecretKey { get; set; }
        public string? Category { get; set; }
        public string? Path { get; set; }
        public long? FileSize { get; set; }
    }
}
