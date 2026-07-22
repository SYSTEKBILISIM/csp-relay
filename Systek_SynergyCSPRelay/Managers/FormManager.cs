using System;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
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

        private object NormalizeControlValue(object value, string dataType = null)
        {
            if (value == null)
                return null;

            if (value is JsonElement jsonElement)
            {
                switch (jsonElement.ValueKind)
                {
                    case JsonValueKind.String:
                        return CoerceControlValue(jsonElement.GetString(), dataType);
                    case JsonValueKind.Number:
                        if (jsonElement.TryGetInt32(out int intValue))
                            return CoerceControlValue(intValue, dataType);
                        if (jsonElement.TryGetInt64(out long longValue))
                            return CoerceControlValue(longValue, dataType);
                        if (jsonElement.TryGetDecimal(out decimal decimalValue))
                            return CoerceControlValue(decimalValue, dataType);
                        return CoerceControlValue(jsonElement.GetDouble(), dataType);
                    case JsonValueKind.True:
                        return CoerceControlValue(true, dataType);
                    case JsonValueKind.False:
                        return CoerceControlValue(false, dataType);
                    case JsonValueKind.Array:
                        return jsonElement.EnumerateArray()
                            .Select(item => NormalizeControlValue(item, dataType))
                            .ToList();
                    case JsonValueKind.Object:
                        return jsonElement.EnumerateObject()
                            .ToDictionary(
                                property => property.Name,
                                property => NormalizeControlValue(property.Value)
                            );
                    case JsonValueKind.Null:
                    case JsonValueKind.Undefined:
                        return null;
                }
            }

            if (value is JValue jValue)
                return CoerceControlValue(jValue.Value, dataType);

            if (value is JArray jArray)
                return jArray.Select(item => NormalizeControlValue(item, dataType)).ToList();

            if (value is JObject jObject)
                return jObject.Properties().ToDictionary(
                    property => property.Name,
                    property => NormalizeControlValue(property.Value)
                );

            if (value is IEnumerable<object> objectList)
                return objectList.Select(item => NormalizeControlValue(item, dataType)).ToList();

            if (value is IEnumerable nonGenericList && !(value is string))
                return nonGenericList.Cast<object>()
                    .Select(item => NormalizeControlValue(item, dataType))
                    .ToList();

            return CoerceControlValue(value, dataType);
        }

        private object CoerceControlValue(object value, string dataType)
        {
            if (value == null || string.IsNullOrWhiteSpace(dataType))
                return value;

            try
            {
                switch (dataType.Trim().ToLowerInvariant())
                {
                    case "string":
                        return Convert.ToString(value, CultureInfo.InvariantCulture);
                    case "integer":
                        long integerValue = Convert.ToInt64(value, CultureInfo.InvariantCulture);
                        return integerValue >= int.MinValue && integerValue <= int.MaxValue
                            ? (object)(int)integerValue
                            : integerValue;
                    case "decimal":
                        return Convert.ToDecimal(value, CultureInfo.InvariantCulture);
                    case "boolean":
                        return Convert.ToBoolean(value, CultureInfo.InvariantCulture);
                    default:
                        return value;
                }
            }
            catch (FormatException)
            {
                return value;
            }
            catch (InvalidCastException)
            {
                return value;
            }
            catch (OverflowException)
            {
                return value;
            }
        }

        private void SetObjects(FormInstance formInstance, List<ObjectModel> objects)
        {
            foreach (var obj in objects)
            {
                try
                {
                    object normalizedValue = NormalizeControlValue(obj.Value, obj.DataType);
                    string normalizedText = obj.Text?.ToString();

                    if (formInstance.Controls[obj.FieldName].Type == "Lookup")
                    {
                        var values = normalizedValue switch
                        {
                            IEnumerable<object> list => list.ToList(),
                            IEnumerable nonGenericList => nonGenericList.Cast<object>().ToList(),
                            _ => normalizedValue != null ? new List<object> { normalizedValue } : new List<object>()
                        };

                        if (normalizedValue != null && (!(normalizedValue is string strValueLookup) || !string.IsNullOrWhiteSpace(strValueLookup)))
                            formInstance.Controls[obj.FieldName].Value = values;
                        if (!string.IsNullOrWhiteSpace(normalizedText))
                            formInstance.Controls[obj.FieldName].Text = normalizedText;
                        continue;
                    }

                    if (!string.IsNullOrWhiteSpace(normalizedText))
                        formInstance.Controls[obj.FieldName].Text = normalizedText;
                    if (normalizedValue != null && (!(normalizedValue is string strValueObject) || !string.IsNullOrWhiteSpace(strValueObject)))
                        formInstance.Controls[obj.FieldName].Value = normalizedValue;
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

                    if (IsOverwriteMode(inline.WriteMode))
                        grid.Rows.Clear();

                    foreach(var row in inline.Rows) {
                        if (HasDuplicateValue(grid, inline.UniqueColumns, inline.CaseSensitiveUniqueColumns, row.Objects))
                            continue;

                        GridDataRow newRow = new GridDataRow();
                        foreach(var obj in row.Objects) {
                            GridDataRowCell cell = new GridDataRowCell();
                            cell.Name = obj.FieldName;
                            cell.Value = NormalizeControlValue(obj.Value, obj.DataType);
                            cell.Text = obj.Text?.ToString();
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
                string defaultSavePath = NormalizeDocumentPath(formInstance.ClientForm.Data.Entities.Items[rds.FieldName]["properties"]["path"].ToString());
                foreach(var rdItem in rds.Items) {
                    string savePath = !string.IsNullOrWhiteSpace(rdItem.Path)
                        ? NormalizeDocumentPath(rdItem.Path)
                        : defaultSavePath;
                    if (string.IsNullOrWhiteSpace(rdItem.FileSecretKey) && string.IsNullOrWhiteSpace(rdItem.Data))
                        throw new ArgumentException($"RelatedDocument '{rds.FieldName}' item must include FileSecretKey or Data.");

                    var relatedFile = !string.IsNullOrWhiteSpace(rdItem.FileSecretKey)
                        ? documentManagementHelper.GetFileFromSecretKey(rdItem.FileSecretKey).Result.Response
                        : documentManagementHelper.CreateFile(
                            rdItem.Name ?? "RelatedDocument",
                            rdItem.Description ?? rdItem.Name ?? string.Empty,
                            Convert.FromBase64String(rdItem.Data ?? string.Empty),
                            savePath,
                            rdItem.ContentType ?? "application/octet-stream"
                        ).Result.Response;

                    var relatedItems = formInstance.Controls[rds.FieldName].Value.ToJsonString().ToObject<List<RelatedDocumentFile>>();
                    var relatedCategories = formInstance.Controls[rds.FieldName].Categories.ToJsonString().ToObject<List<RelatedDocumentCategory>>();
                    string categoryName = !string.IsNullOrWhiteSpace(rdItem.Category)
                        ? rdItem.Category
                        : savePath.Split('/').FirstOrDefault();
                    var selectedCategory = relatedCategories.FirstOrDefault(c => c.Name.Values.Any(v => v == categoryName)) ?? relatedCategories.FirstOrDefault();
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

        private string NormalizeDocumentPath(string path)
        {
            return (path ?? string.Empty).Replace("\\", "/").Trim().Trim('/');
        }

        private void SetRelatedGrids(FormInstance formInstance, FormData formData, List<RelatedGridModel> relatedGrids) {
            foreach(var relatedGrid in relatedGrids) {
                try {
                    GridData grid = GridData.FromControl(formInstance.Controls[relatedGrid.FieldName]);
                    if (IsOverwriteMode(relatedGrid.WriteMode))
                        grid.Rows.Clear();

                    foreach(var relatedRow in relatedGrid.Rows) {
                        if (HasDuplicateValue(grid, relatedGrid.UniqueColumns, relatedGrid.CaseSensitiveUniqueColumns, relatedRow.FormFields?.Objects))
                            continue;

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

        private bool IsOverwriteMode(string writeMode)
        {
            return string.Equals(writeMode, "Overwrite", StringComparison.OrdinalIgnoreCase);
        }

        private bool HasDuplicateValue(GridData grid, List<string> uniqueColumns, List<string> caseSensitiveUniqueColumns, List<ObjectModel> incomingObjects)
        {
            if (grid?.Rows == null || uniqueColumns == null || uniqueColumns.Count == 0 || incomingObjects == null)
                return false;

            foreach (string columnName in uniqueColumns.Where(name => !string.IsNullOrWhiteSpace(name)))
            {
                ObjectModel incomingObject = incomingObjects.FirstOrDefault(obj =>
                    string.Equals(obj.FieldName, columnName, StringComparison.OrdinalIgnoreCase));
                if (incomingObject == null)
                    throw new ArgumentException($"Duplicate check column '{columnName}' was not found in the incoming grid row.");

                string incomingValue = NormalizeGridValue(incomingObject.Value, incomingObject.Text);
                if (string.IsNullOrEmpty(incomingValue))
                    continue;

                List<GridDataRowCell> existingCells = grid.Rows
                    .Select(row => row.Cells.FirstOrDefault(cell =>
                        string.Equals(cell.Name, columnName, StringComparison.OrdinalIgnoreCase)))
                    .Where(cell => cell != null)
                    .ToList();

                if (grid.Rows.Count > 0 && existingCells.Count == 0)
                    throw new ArgumentException($"Duplicate check column '{columnName}' was not found in the existing target grid rows.");

                bool caseSensitive = caseSensitiveUniqueColumns != null && caseSensitiveUniqueColumns.Any(name =>
                    string.Equals(name, columnName, StringComparison.OrdinalIgnoreCase));
                StringComparison comparison = caseSensitive
                    ? StringComparison.CurrentCulture
                    : StringComparison.CurrentCultureIgnoreCase;

                bool alreadyExists = existingCells.Any(existingCell => string.Equals(
                        NormalizeGridValue(existingCell.Value, existingCell.Text),
                        incomingValue,
                        comparison));

                if (alreadyExists)
                    return true;
            }

            return false;
        }

        private string NormalizeGridValue(object value, string text)
        {
            object candidate = value;
            if (candidate == null || (candidate is string stringValue && string.IsNullOrWhiteSpace(stringValue)))
                candidate = text;
            if (candidate == null)
                return null;

            if (candidate is JValue jValue)
                return NormalizeGridValue(jValue.Value, text);
            if (candidate is JArray jArray && jArray.Count == 1)
                return NormalizeGridValue(jArray[0], text);
            if (candidate is JsonElement jsonArray && jsonArray.ValueKind == JsonValueKind.Array && jsonArray.GetArrayLength() == 1)
                return NormalizeGridValue(jsonArray.EnumerateArray().First(), text);
            if (candidate is IEnumerable enumerable && !(candidate is string))
            {
                List<object> items = enumerable.Cast<object>().ToList();
                if (items.Count == 1)
                    return NormalizeGridValue(items[0], text);
            }

            string serializedValue;
            if (candidate is JToken token)
                serializedValue = token.ToString(Newtonsoft.Json.Formatting.None);
            else if (candidate is JsonElement jsonElement)
                serializedValue = jsonElement.GetRawText();
            else if (candidate is string valueString)
                serializedValue = valueString;
            else if (candidate is IFormattable formattable)
                serializedValue = formattable.ToString(null, CultureInfo.InvariantCulture);
            else
                serializedValue = candidate.ToJsonString();

            return serializedValue?.Trim();
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
