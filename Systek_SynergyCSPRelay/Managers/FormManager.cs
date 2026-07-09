using System;
using System.Linq;
using System.Collections;
using System.Collections.Generic;
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
            FormInstance formInstance = _serviceAPI.FormManager.CreateWithoutView(request.ProjectName, request.FormName, 0, false, null, false, request.FormParameters).Result;
            return this.SaveForm(formInstance, request.FormFields, request.FormParameters).Result;
        }

        public async Task<SaveFormResultModel> EditAndSave(EditFormRequestModel request)
        {
            FormInstance formInstance = _serviceAPI.FormManager.CreateWithoutView(request.ProjectName, request.FormName, request.DocumentId, false, null, false, request.FormParameters).Result;
            return this.SaveForm(formInstance, request.FormFields, request.FormParameters).Result;
        }

        public async Task<SaveFormResultModel> SaveForm(FormInstance formInstance, FormFieldsModel fields, Dictionary<string, object> parameters)
        {
            FormData formData = new FormData();

            if(fields?.Objects != null)
                SetObjects(formInstance, fields.Objects);

            if(fields?.InlineGrids != null)
                SetInlineGrids(formInstance, formData, fields.InlineGrids);

            if(fields?.RelatedDocuments != null)
                SetRelatedDocuments(formInstance, fields.RelatedDocuments);

            if(fields?.RelatedGrids != null)
                SetRelatedGrids(formInstance, formData, fields.RelatedGrids);

            formInstance.MergeData(formData.ControlValues);
            var formSave = formInstance.Save().Result;
            
            if(parameters != null)
                foreach(KeyValuePair<string, object> p in parameters)
                    if(!formInstance.Parameters.ContainsKey(p.Key))
                        formInstance.Parameters.Add(p.Key, p.Value);
            
            return new() {
                Status = formSave.Status == FormStatus.Completed ? ResultStatus.Success : ResultStatus.Error,
                SaveResponse = formSave
            };
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
                        var relatedFormInstance = _serviceAPI.FormManager.CreateWithoutView(relatedGrid.ProjectName, relatedGrid.FormName, relatedDocumentId).Result;
                        if(relatedRow.RelationDocumentId == 0) {
                            var relatedResult = this.SaveForm(relatedFormInstance, relatedRow.FormFields, relatedRow.FormParameters).Result;

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
    }
}
