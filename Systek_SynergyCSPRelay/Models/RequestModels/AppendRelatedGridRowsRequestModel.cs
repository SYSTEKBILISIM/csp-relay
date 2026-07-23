namespace Ataven.Models
{
    public class AppendRelatedGridRowsRequestModel
    {
        public string SessionId { get; set; }
        public string DocumentName { get; set; }
        public RelatedGridModel RelatedGrid { get; set; }
    }

    public class UploadSessionFileChunkRequestModel
    {
        public string SessionId { get; set; }
        public string UploadToken { get; set; }
        public string Data { get; set; }
        public long DataLength { get; set; }
        public long ChunkStart { get; set; }
        public long TotalEncodedLength { get; set; }
    }
}
