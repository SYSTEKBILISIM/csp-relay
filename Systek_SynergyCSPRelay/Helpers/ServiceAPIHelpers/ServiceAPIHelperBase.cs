using System;
using System.Threading.Tasks;

namespace Ataven.Helpers.ServiceAPIHelpers
{
    public abstract class ServiceAPIHelperBase
    {
        internal static async Task<ServiceAPIHelpersResponse<T>> ExecuteWithHandlingAsync<T>(Func<Task<T>> func)
        {
            try
            {
                T result = await func();
                return new ServiceAPIHelpersResponse<T>
                {
                    Success = true,
                    Response = result
                };
            }
            catch (Exception ex)
            {
                return new ServiceAPIHelpersResponse<T>
                {
                    Success = false,
                    Exception = ex
                };
            }
        }
        
        public class ServiceAPIHelpersResponse<T>
        {
            public bool Success { get; set; }
            public T Response { get; set; } = default;
            public Exception Exception { get; set; } = null;
        }
    }
}
