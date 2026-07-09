using System;

namespace Ataven.Models
{
    public class CreateFileRequestModel
    {
        public string Name { get; set; }
        public string? Description { get; set; }
        public string? Path { get; set; }
        public string Data { get; set; }
        public string ContentType { get; set; }
        public string Extension { get; set; }

        public byte[] GetByteData()
        {
            return Convert.FromBase64String(this.Data);
        }
    }
}