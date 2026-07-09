using System;
using System.Collections.Generic;
using Bimser.Synergy.Entities.DocumentManagement.Business.Objects;

namespace Ataven.Models
{
    public class UploadFilePartsRequestModel
    {
        public string FileSecretKey { get; set; }
        public List<UploadPart> UploadParts { get; set; }
        public string Data { get; set; }
        public string ContentType { get; set; }
        public long? DataLength { get; set; }
        public long? ChunkStartByte { get; set; }
        public long? TotalFileBytes { get; set; }

        public byte[] GetByteData()
        {
            return Convert.FromBase64String(this.Data);
        }
    }
}
