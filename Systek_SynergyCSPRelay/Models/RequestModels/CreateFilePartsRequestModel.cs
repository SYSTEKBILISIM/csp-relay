namespace Ataven.Models
{
    public class CreateFilePartsRequestModel
    {
        public string Name { get; set; }
        public string? Description { get; set; }
        public string? Path { get; set; }
        public long DataLength { get; set; }
        public string ContentType { get; set; }
    }
}