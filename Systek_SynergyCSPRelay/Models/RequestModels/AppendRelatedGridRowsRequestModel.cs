namespace Ataven.Models
{
    public class AppendRelatedGridRowsRequestModel
    {
        public string SessionId { get; set; }
        public string DocumentName { get; set; }
        public RelatedGridModel RelatedGrid { get; set; }
    }
}
