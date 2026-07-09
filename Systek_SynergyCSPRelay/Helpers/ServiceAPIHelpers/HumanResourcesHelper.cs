using Bimser.Synergy.Entities.HumanResources.Business.DTOs.Responses;
using Bimser.Synergy.Entities.HumanResources.Business.Objects;
using Bimser.Synergy.ServiceAPI;
using System.Threading.Tasks;

namespace Ataven.Helpers.ServiceAPIHelpers
{
    public class HumanResourcesHelper : ServiceAPIHelperBase
    {
        private ServiceAPI ServiceAPI { get; set; }
        public HumanResourcesHelper(ServiceAPI serviceAPI)
        {
            ServiceAPI = serviceAPI;
        }
        public async Task<ServiceAPIHelpersResponse<UserStartupInfoResponse>> GetCurrentUserInfo()
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var response = await ServiceAPI.HumanResources.GetCurrentUserInfo();
                return response.Result;
            });
        }
        public async Task<ServiceAPIHelpersResponse<User>> GetUserByUserId(long userId)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var response = await ServiceAPI.HumanResources.GetUserByUserId(userId);
                return response.Result;
            });
        }
        public async Task<ServiceAPIHelpersResponse<User>> GetUserByUserName(string userName)
        {
            return await ExecuteWithHandlingAsync(async () =>
            {
                var response = await ServiceAPI.HumanResources.GetUserByUserName(userName);
                return response.Result;
            });
        }
    }
}
