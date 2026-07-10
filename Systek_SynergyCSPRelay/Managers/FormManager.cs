using System;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using Ataven.Helpers.ServiceAPIHelpers;
using Ataven.Models;
using Ataven.Enums;
using Ataven.Exceptions;
using Bimser.Framework.Json;
using Bimser.Synergy.ServiceAPI;
using Bimser.Synergy.ServiceAPI.Models.Form;
using Bimser.Synergy.Entities.FormDesigner.Runtime.Enums;
using Bimser.CSP.FormControls.Controls;
using Newtonsoft.Json.Linq;

namespace Ataven.Managers
{
    public class FormManager
    {
        private readonly ServiceAPI _serviceAPI;

        public FormManager(ServiceAPI serviceAPI)
        {
            _serviceAPI = serviceAPI;
        }
        public async Task<SaveFormResultModel> CreateAndSave(CreateFormRequestModel request)
        {
            FormInstance formInstance = _serviceAPI.FormManager.CreateWithoutView(request.ProjectName, request.FormName, 0, false, null, false, ResolvePlainParameters(request.FormParameters)).Result;
            return this.SaveForm(formInstance, request.FormFields, request.FormParameters).Result;
        }

        public async Task<SaveFormResultModel> EditAndSave(EditFormRequestModel request)
        {
            FormInstance formInstance = _serviceAPI.FormManager.CreateWithoutView(request.ProjectName, request.FormName, request.DocumentId, false, null, false, ResolvePlainParameters(request.FormParameters)).Result;
            return this.SaveForm(formInstance, request.FormFields, request.FormParameters).Result;
        }

        public async Task<SaveFormResultModel> SaveForm(FormInstance formInstance, FormFieldsModel fields, Dictionary<string, object> parameters)
        {
            return await SaveForm(formInstance, fields, parameters, null);
        }

        public async Task<SaveFormResultModel> SaveForm(FormInstance formInstance, FormFieldsModel fields, Dictionary<string, object> parameters, FormInstance parentFormInstance)
        {
            PrepareForm(formInstance, fields, parameters, parentFormInstance, true);
            var formSave = formInstance.Save().Result;

            return new() {
                Status = formSave.Status == FormStatus.Completed ? ResultStatus.Success : ResultStatus.Error,
                SaveResponse = formSave
            };
        }

        public void PrepareForm(FormInstance formInstance, FormFieldsModel fields, Dictionary<string, object> parameters, FormInstance parentFormInstance = null, bool includeRelatedGrids = true)
        {
            FormData formData = new FormData();

            if(fields?.Objects != null)
                SetObjects(formInstance, fields.Objects);

            if(fields?.InlineGrids != null)
                SetInlineGrids(formInstance, formData, fields.InlineGrids);

            if(fields?.RelatedDocuments != null)
                SetRelatedDocuments(formInstance, fields.RelatedDocuments);

            formInstance.MergeData(formData.ControlValues);
            ApplyParameters(formInstance, parameters, parentFormInstance);

            if(includeRelatedGrids && fields?.RelatedGrids != null)
                SetRelatedGrids(formInstance, formData, fields.RelatedGrids);

            formInstance.MergeData(formData.ControlValues);
        }

        public void AppendRelatedGridRows(FormInstance formInstance, RelatedGridModel relatedGrid)
        {
            FormData formData = new FormData();
            SetRelatedGrids(formInstance, formData, new List<RelatedGridModel> { relatedGrid });
            formInstance.MergeData(formData.ControlValues);
        }

        private Dictionary<string, object> ResolvePlainParameters(Dictionary<string, object> parameters)
        {
            if (parameters == null)
                return null;

            Dictionary<string, object> plainParameters = new Dictionary<string, object>();
            foreach (KeyValuePair<string, object> p in parameters)
            {
                if (!IsFormControlParameter(p.Value))
                    plainParameters[p.Key] = p.Value;
            }

            return plainParameters;
        }

        private void ApplyParameters(FormInstance formInstance, Dictionary<string, object> parameters, FormInstance parentFormInstance)
        {
            if (parameters == null)
                return;

            foreach (KeyValuePair<string, object> p in parameters)
            {
                object value = ResolveParameterValue(p.Value, formInstance, parentFormInstance);
                if (formInstance.Parameters.ContainsKey(p.Key))
                    formInstance.Parameters[p.Key] = value;
                else
                    formInstance.Parameters.Add(p.Key, value);
            }
        }

        private object ResolveParameterValue(object parameterValue, FormInstance formInstance, FormInstance parentFormInstance)
        {
            JObject parameterObject = ToJObject(parameterValue);
            if (parameterObject == null || !IsFormControlParameter(parameterObject))
                return parameterValue;

            string controlName = parameterObject.Value<string>("ControlName") ?? parameterObject.Value<string>("controlName");
            string property = parameterObject.Value<string>("Property") ?? parameterObject.Value<string>("property") ?? "Value";
            string scope = parameterObject.Value<string>("Scope") ?? parameterObject.Value<string>("scope") ?? "Parent";

            if (string.IsNullOrWhiteSpace(controlName))
                throw new ArgumentException("FormControl parameter requires ControlName.");

            FormInstance sourceForm = scope.Equals("Current", StringComparison.OrdinalIgnoreCase)
                ? formInstance
                : parentFormInstance ?? formInstance;

            try
            {
                var control = sourceForm.Controls[controlName];
                return property.Equals("Text", StringComparison.OrdinalIgnoreCase)
                    ? control.Text
                    : control.Value;
            }
            catch (Exception ex)
            {
                throw new ArgumentException($"FormControl parameter source field '{controlName}' was not found.", ex);
            }
        }

        private bool IsFormControlParameter(object parameterValue)
        {
            JObject parameterObject = ToJObject(parameterValue);
            return parameterObject != null && IsFormControlParameter(parameterObject);
        }

        private bool IsFormControlParameter(JObject parameterObject)
        {
            string source = parameterObject.Value<string>("Source") ?? parameterObject.Value<string>("source");
            return source != null && source.Equals("FormControl", StringComparison.OrdinalIgnoreCase);
        }

        private JObject ToJObject(object value)
        {
            if (value == null)
                return null;
            if (value is JObject jObject)
                return jObject;
            if (value is JsonElement jsonElement && jsonElement.ValueKind == JsonValueKind.Object)
                return JObject.Parse(jsonElement.GetRawText());
            if (value is IDictionary<string, object>)
                return JObject.FromObject(value);

            return null;
        }

        private void SetObjects(FormInstance formInstance, List<ObjectModel> objects)
        {
            foreach (var obj in objects)
            {
                try
                {
                    if (formInstance.Controls[obj.FieldName].Type == "Lookup")
                    {
                        var values = obj.Value switch
                        {
                            IEnumerable<object> list => list.ToList(),
                            IEnumerable nonGenericList => nonGenericList.Cast<object>().ToList(),
                            _ => obj.Value != null ? new List<object> { obj.Value } : new List<object>()
                        };

                        if (obj.Value != null && (!(obj.Value is string strValueLookup) || !string.IsNullOrWhiteSpace(strValueLookup)))
                            formInstance.Controls[obj.FieldName].Value = values;
                        if (!string.IsNullOrWhiteSpace(obj.Text))
                            formInstance.Controls[obj.FieldName].Text = obj.Text;
                        continue;
                    }

                    if (obj.Value != null && (!(obj.Value is string strValueObject) || !string.IsNullOrWhiteSpace(strValueObject)))
                        formInstance.Controls[obj.FieldName].Value = obj.Value;
                    if (!string.IsNullOrWhiteSpace(obj.Text))
                        formInstance.Controls[obj.FieldName].Text = obj.Text;
                }
                catch (Exception ex)
                {
                    throw new FormSaveException(
                        sourceName: "SaveObject",
                        fieldName: obj.FieldName,
                        section: obj,
                        inner: ex
                    );
                }
            }
        }

        private void SetInlineGrids(FormInstance formInstance, FormData formData, List<InlineGridModel> inlineGrids) {
            foreach(var inline in inlineGrids) {
                try {
                    GridData grid = GridData.FromControl(formInstance.Controls[inline.FieldName]);

                    foreach(var row in inline.Rows) {
                        GridDataRow newRow = new GridDataRow();
                        foreach(var obj in row.Objects) {
                            GridDataRowCell cell = new GridDataRowCell();
                            cell.Name = obj.FieldName;
                            cell.Value = obj.Value;
                            cell.Text = obj.Text;
                            newRow.Cells.Add(cell);
                        }
                        grid.Rows.Add(newRow);
                    }

                    formData.ControlValues.Add(inline.FieldName, grid.ToJsonString());
                } catch(Exception ex) {
                    throw new FormSaveException(
                        sourceName: "SaveInlineGrid",
                        fieldName: inline.FieldName,
                        section: inline,
                        inner: ex
                    );
                }
            }
        }

        private void SetRelatedDocuments(FormInstance formInstance, List<RelatedDocumentsModel> relatedDocuments) {
            DocumentManagementHelper documentManagementHelper = _serviceAPI.GetHelperInstance<DocumentManagementHelper>();
            foreach(var rds in relatedDocuments) {
                string savePath = formInstance.ClientForm.Data.Entities.Items[rds.FieldName]["properties"]["path"].ToString();
                foreach(var rdItem in rds.Items) {
                    var relatedFile = documentManagementHelper.GetFileFromSecretKey(rdItem.FileSecretKey).Result.Response;

                    var relatedItems = formInstance.Controls[rds.FieldName].Value.ToJsonString().ToObject<List<RelatedDocumentFile>>();
                    var relatedCategories = formInstance.Controls[rds.FieldName].Categories.ToJsonString().ToObject<List<RelatedDocumentCategory>>();
                    var selectedCategory = relatedCategories.FirstOrDefault(c => c.Name.Values.Any(v => v == rdItem.Category)) ?? relatedCategories.FirstOrDefault();
                    string currentLanguage = _serviceAPI.HumanResources.GetCurrentUserInfo().Result.Result.Info.Language;
                    var rdItemName = relatedFile.Name.TryGetValue(currentLanguage, out var localizedName) ? localizedName : relatedFile.Name.Values.First();
                    var rdItemDesc = relatedFile.Description.TryGetValue(currentLanguage, out var localizedDescription) ? localizedDescription : relatedFile.Description.Values.First();
                    relatedItems ??= new List<RelatedDocumentFile>();
                    relatedItems.Add(new RelatedDocumentFile
                    {
                        Id = relatedFile.Id.ToString(),
                        Name = rdItemName,
                        Description = rdItemDesc,
                        Path = savePath,
                        Extension = rdItemName.Contains(".") ? "." + rdItemName.Split(".").Last() : string.Empty,
                        CreateDate = relatedFile.CreatedAt,
                        Creator = relatedFile.CreatedBy.Username,
                        Category = selectedCategory,
                        FileSize = rdItem.FileSize ?? 0,
                        Data = null,
                        SecretKey = relatedFile.SecretKey,
                        DownloadUrl = null
                    });
                    formInstance.Controls[rds.FieldName].Value = relatedItems;
                }
            }
        }

        private void SetRelatedGrids(FormInstance formInstance, FormData formData, List<RelatedGridModel> relatedGrids) {
            foreach(var relatedGrid in relatedGrids) {
                try {
                    GridData grid = GridData.FromControl(formInstance.Controls[relatedGrid.FieldName]);
                    foreach(var relatedRow in relatedGrid.Rows) {
                        long relatedDocumentId = relatedRow.RelationDocumentId;
                        Dictionary<string, object> resolvedRelatedParameters = ResolveParametersAgainstParent(relatedRow.FormParameters, formInstance);
                        var relatedFormInstance = _serviceAPI.FormManager.CreateWithoutView(relatedGrid.ProjectName, relatedGrid.FormName, relatedDocumentId, false, null, false, resolvedRelatedParameters).Result;
                        if(relatedRow.RelationDocumentId == 0) {
                            var relatedResult = this.SaveForm(relatedFormInstance, relatedRow.FormFields, relatedRow.FormParameters, formInstance).Result;

                            if(relatedResult.SaveResponse.Status != FormStatus.Completed)
                                throw new FormSaveException(
                                    sourceName: "SaveRelatedRow",
                                    fieldName: null,
                                    section: relatedRow,
                                    errorDetail: relatedResult.SaveResponse
                                );
                            
                            relatedDocumentId = relatedResult.SaveResponse.DocumentId;
                        }
                    
                        GridDataRow newRow = new GridDataRow();
                        foreach (var column in grid.Columns) {
                            GridDataRowCell cell = new GridDataRowCell();
                            
                            if(column.Name == relatedGrid.DocumentIdColumnName) {
                                cell.Name = relatedGrid.DocumentIdColumnName;
                                cell.Value = relatedDocumentId;
                                cell.Text = relatedDocumentId.ToString();
                                newRow.Cells.Add(cell);
                                continue;
                            }

                            var relatedCell = relatedFormInstance.Controls[column.Name];
                            if (relatedCell == null)
                                continue;

                            cell.Name = column.Name;
                            cell.Value = relatedCell.Value;
                            cell.Text = relatedCell.Text?.ToString();
                            newRow.Cells.Add(cell);
                        }
                        grid.Rows.Add(newRow);
                    }
                    formData.ControlValues.Add(relatedGrid.FieldName, grid.ToJsonString());
                } catch(Exception ex) {
                    throw new FormSaveException(
                        sourceName: "SaveRelatedGrid",
                        fieldName: relatedGrid.FieldName,
                        section: relatedGrid,
                        inner: ex
                    );
                }
            }
        }

        private Dictionary<string, object> ResolveParametersAgainstParent(Dictionary<string, object> parameters, FormInstance parentFormInstance)
        {
            if (parameters == null)
                return null;

            Dictionary<string, object> resolved = new Dictionary<string, object>();
            foreach (KeyValuePair<string, object> p in parameters)
                resolved[p.Key] = IsFormControlParameter(p.Value)
                    ? ResolveParameterValue(p.Value, parentFormInstance, parentFormInstance)
                    : p.Value;

            return resolved;
        }
    }
}
