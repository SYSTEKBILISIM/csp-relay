using Bimser.Synergy.ServiceAPI;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Ataven.Helpers.ServiceAPIHelpers
{
    public class DataSourceHelper : ServiceAPIHelperBase
    {
        private readonly ServiceAPI ServiceAPI;
        public DataSourceHelper(ServiceAPI serviceAPI)
        {
            this.ServiceAPI = serviceAPI;
        }
        
        public async Task<ServiceAPIHelpersResponse<List<T>>> GetData<T>(string projectName, string queryName, object parameters = null)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                return (await ServiceAPI.DataSourceManager.ExecuteQuery<T>(projectName, queryName, parameters)).ToList();
            });
        }
    }
}
