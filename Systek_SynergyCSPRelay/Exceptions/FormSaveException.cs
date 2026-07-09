
using System;
using Newtonsoft.Json;

namespace Ataven.Exceptions
{
    public class FormSaveException : Exception
    {
        public string SourceName { get; }
        public string FieldName { get; }
        public object Section { get; }
        public object? ErrorDetail { get; }
        public string InnerError { get; }
        public string InnerStack { get; }

        public FormSaveException(
            string sourceName,
            string fieldName,
            object section,
            object errorDetail = null,
            Exception inner = null)
            : base("Form save error", inner)
        {
            SourceName = sourceName;
            FieldName = fieldName;
            Section = section;
            if(errorDetail != null)
                ErrorDetail = errorDetail;

            if (inner != null)
            {
                InnerError = inner.Message;
                InnerStack = inner.StackTrace;
            }
        }

        public override string ToString()
        {
            var error = new
            {
                Source = SourceName,
                FieldName,
                Section,
                Error = ErrorDetail,
                InnerError,
                InnerStack,
                Stack = StackTrace
            };

            return JsonConvert.SerializeObject(error, Formatting.Indented);
        }
    }
}
