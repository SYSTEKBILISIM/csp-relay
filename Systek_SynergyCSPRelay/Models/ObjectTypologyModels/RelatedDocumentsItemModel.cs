using System;

namespace Ataven.Models
{
    public class RelatedDocumentsItemModel
    {
        public string? FileSecretKey { get; set; }
        public string? Category { get; set; }
        public string? Path { get; set; }
        public long? FileSize { get; set; }
        public string? Name { get; set; }
        public string? Description { get; set; }
        public string? ContentType { get; set; }
        public string? Data { get; set; }
        public string? TransferFileToken { get; set; }
    }
}
