using Bimser.CSP.FormControls.Controls;
using Bimser.Framework.Web.Models;
using Bimser.Synergy.Entities.Shared.Business.Objects;
using Bimser.Synergy.Entities.Workflow.Runtime.Options;
using Bimser.Synergy.ServiceAPI.Models.Authentication;
using Newtonsoft.Json;
using System;
using System.Collections;
using System.Text.RegularExpressions;
using Bimser.Synergy.ServiceAPI;

namespace Ataven.Helpers.ServiceAPIHelpers
{
    public static class ServiceAPIConnector
    {
        internal static ServiceAPI Create(UserSession session, string webInterfaceUrl = null)
        {
            var credentials = GetTokenCredential(session.Token, session.EncryptedData, session.Language);
            return new ServiceAPI(credentials, webInterfaceUrl ?? WebInterfaceUrl);
        }
        internal static ServiceAPI Create(Context context, string webInterfaceUrl = null)
        {
            var credentials = GetTokenCredential(context.Token, context.EncryptedData, context.Language);
            return new ServiceAPI(credentials, webInterfaceUrl ?? WebInterfaceUrl);
        }
        internal static ServiceAPI Create(ClientContext context, string webInterfaceUrl = null)
        {
            var credentials = GetTokenCredential(context.Token, context.EncryptedData, context.Language);
            return new ServiceAPI(credentials, webInterfaceUrl ?? WebInterfaceUrl);
        }
        
        internal static ServiceAPI Create(string token, string encryptedData, string language, string webInterfaceUrl = null)
        {
            var credentials = GetTokenCredential(token, encryptedData, language);
            return new ServiceAPI(credentials, webInterfaceUrl ?? WebInterfaceUrl);
        }
                
        internal static ServiceAPI CreateWithBasic(string username, string password, string language, string webInterfaceUrl = null)
        {
            var credentials = GetBasicCredential(username, password, language);
            return new ServiceAPI(credentials, webInterfaceUrl ?? WebInterfaceUrl);
        }
        internal static LoginWithBasicAuthenticationParameters GetBasicCredential(string username, string password, string language)
        {
            return new LoginWithBasicAuthenticationParameters()
            {
                DomainAddress = DomainAddress,
                Username = username,
                Password = password,
                Language = language
            };
        }
        internal static LoginWithTokenAuthenticationParameters GetTokenCredential(string token, string encryptedData, string language)
        {
            return new LoginWithTokenAuthenticationParameters()
            {
                DomainAddress = WebInterfaceUrl,
                Token = token,
                EncryptedData = encryptedData,
                Language = language
            };
        }
        internal static T GetHelperInstance<T>(this ServiceAPI serviceAPI) where T : class
        {
            if (serviceAPI == null)
            {
                throw new ArgumentNullException(nameof(serviceAPI));
            }
            try
            {
                object instance = Activator.CreateInstance(typeof(T), serviceAPI);
                return (T)instance;
            }
            catch (MissingMethodException ex)
            {
                throw new InvalidOperationException($"Type '{typeof(T).FullName}' does not have a public constructor that takes a parameter of type ServiceAPI.",ex);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"An error occurred while creating an instance of type '{typeof(T).FullName}'.", ex);
            }
        }
        internal static IDictionary EnvironmentVariables;
        internal static HttpClientOptions HttpClientOptions;
        internal static ProjectOptions ProjectOptions;
        internal static string AgentId;
        internal static string EncryptedData;
        private static void SetGetEnvironmentVariables()
        {
            EnvironmentVariables = Environment.GetEnvironmentVariables();
            HttpClientOptions = JsonConvert.DeserializeObject<HttpClientOptions>(EnvironmentVariables["HTTP_CLIENT_OPTIONS"].ToString());
            ProjectOptions = JsonConvert.DeserializeObject<ProjectOptions>(EnvironmentVariables["PROJECT_OPTIONS"].ToString());
            AgentId = EnvironmentVariables["AGENT_ID"]?.ToString();
            EncryptedData = ProjectOptions.EncryptedData?.ToString();
        }

        internal static string WebInterfaceUrl
        {
            get
            {
                if (EnvironmentVariables == null)
                    SetGetEnvironmentVariables();
                return HttpClientOptions.WebInterfaceUrl;
            }
        }
        
        internal static string DomainAddress
        {
            get
            {
                return Regex.Replace(WebInterfaceUrl, @"/api/web/", "");
            }
        }

        internal static string DeployUrl
        {
            get
            {
                if (EnvironmentVariables == null)
                    SetGetEnvironmentVariables();
                string updatedDomainUrl = Regex.Replace(HttpClientOptions.WebInterfaceUrl, @"(https:\/\/)([^.]+)(\.[^.]+\.[^.]+)", "$1$2-bd$3");
                string deployUrlEndpoint = string.IsNullOrEmpty(AgentId) ? $"/deployagent/apps/{ProjectOptions.Name}/latest/api" : $"/{AgentId}/deployagent/apps/{ProjectOptions.Name}/latest/api";
                string modifiedUrl = Regex.Replace(updatedDomainUrl, @"/api/web", deployUrlEndpoint);
                if (!modifiedUrl.EndsWith("/"))
                    modifiedUrl += "/";
                return modifiedUrl;
            }
        }
    }
}