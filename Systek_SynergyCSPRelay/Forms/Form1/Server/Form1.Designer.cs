using System;
using System.Collections.Generic;
using Bimser.Synergy.Entities.DataSource;
using Bimser.Synergy.Entities.DataSource.Providers;
using Bimser.CSP.FormControls.Base;
using Bimser.CSP.FormControls.Common;
using Bimser.CSP.FormControls.Controls;
using Bimser.CSP.FormControls.RuleManager;
using Bimser.CSP.FormControls.Enums;
using Bimser.Framework.Entities;
using Bimser.Framework.Monitoring;
using Newtonsoft.Json;
using Systek_SynergyCSPRelay.Entities;

namespace Systek_SynergyCSPRelay.Forms {

    public partial class Form1 : Form<E_Systek_SynergyCSPRelay_Form1Entity> {

        // properties
        Section Section1 { get; set; }
Column Column1 { get; set; }


        // constructor
        public Form1(FormHttpParameters httpParameters, IContext context)
 : base(httpParameters, context)
        {
        }

        // initialize members
        public override void InitMembers()
        {
            
AddViews("default");
ClientVisible = true;
ProjectName = "Systek_SynergyCSPRelay";
ProjectId = "35f7e264-a7b6-4cb6-a362-02bc372d9470";
EntityPath = "";
ActiveView = "default";
Version = 36;
ReadOnly = false;
ClientReadOnly = false;
DefaultReadOnly = false;
Text = new Dictionary<string, string> {
{ "tr-TR", "Form1" },
{ "en-US", "Form1" },
{ "ru-RU", "Form1" },
{ "az-Latn-AZ", "Form1" },
};
Name = "Form1";
FormId = "88a4b38e-3424-4114-9b8e-c10edbcc59d7";
FormType = FormType.Standard;
ServerEvents = new List<EventItem> {
};
ClientEvents = new List<EventItem> {
};
Statuses = new List<DocumentStatus> {
};
IdentityFormat = "<u>";
IdentityFormatId = 0;
PrintingEnabled = false;
PrintView = "default";
CopyPasteEnabled = false;
VersioningEnabled = false;
CanSaveAsDraft = false;
UseHashCheck = false;
PanelSize = 2;
Style = new Style {
Padding = "10px 20px 10px 20px",
BackgroundColor = "rgba(255, 255, 255, 0)",
BackgroundImage = "",
BackgroundImageLayout = BackgroundImageLayout.None,
Height = null
};
PublicFields = new List<FormPublicField> {
new FormPublicField {
Field = "CREATOR",
Caption = "Creator",
Visible = true,
DisplayFormat = "",
},
new FormPublicField {
Field = "CREATEDATE",
Caption = "Create Date",
Visible = true,
DisplayFormat = "",
},
new FormPublicField {
Field = "FORMCAPTION",
Caption = "Form Caption",
Visible = false,
DisplayFormat = "",
},
new FormPublicField {
Field = "DOCUMENTID",
Caption = "Document Id",
Visible = false,
DisplayFormat = "",
},
new FormPublicField {
Field = "STATUSTEXT",
Caption = "Status",
Visible = false,
DisplayFormat = "",
},
new FormPublicField {
Field = "STATUS",
Caption = "Status Id",
Visible = false,
DisplayFormat = "",
},
new FormPublicField {
Field = "ID",
Caption = "Global Id",
Visible = false,
DisplayFormat = "",
},
};
ToolbarButtons = new List<ToolbarButton> {
new ToolbarButton {
Key = "toolbarSaveButton",
Name = "Save",
Icon = "save",
Enabled = true,
DefaultEnabled = true,
Validate = false,
Caption = new Dictionary<string, string> {
{ "tr-TR", "Kaydet" },
{ "en-US", "Save" },
{ "ru-RU", "Сохранять" },
{ "az-Latn-AZ", "Yadda Saxla" },
},
View = "",
IsServerPrint = false,
PrintWidthType = "",
PrintCustomWidth = null,
},
new ToolbarButton {
Key = "toolbarSaveAsButton",
Name = "Save As",
Icon = "save-as",
Enabled = false,
DefaultEnabled = false,
Validate = false,
Caption = new Dictionary<string, string> {
{ "tr-TR", "Farklı Kaydet" },
{ "en-US", "Save As" },
{ "ru-RU", "Сохранить как" },
{ "az-Latn-AZ", "Fərqli Saxla" },
},
View = "",
IsServerPrint = false,
PrintWidthType = "",
PrintCustomWidth = null,
},
};
Variables = new Dictionary<string, object> {
};
Rules = new Dictionary<string, Rule> {
};
CheckInCheckOut = new CheckInCheckOutOptions {
Enabled = false,
Timeout = 10,
AdditionalTime = 5,
};
SizeType = SizeType.Middle;
PaddingType = SizeType.Middle;
Caption = new ControlCaption {
Text = new MultiLanguageText(new Dictionary<string, string> {{ "tr-TR", "Form1" },{ "en-US", "Form1" },{ "ru-RU", "Form1" },{ "az-Latn-AZ", "Form1" },}){
EnableMultiLanguageText = true,
UserCulture = "",
DefaultCulture = "",
},
Position = Position.Left,
Size = new Size {
Width = 120,
Height = null
},
Font = new Font {
Family = "Source Sans Pro, sans-serif",
Size = "13",
Color = "#25241f",
Bold = false,
Italic = false,
Underline = false,
Strikethrough = false
},
Visible = true,
Ellipsis = true,
HorizontalAlign = HorizontalAlign.Left,
VerticalAlign = VerticalAlign.Middle,
MarkSettings = new MarkSettings {
Char = "",
Position = MarkPosition.AtFirst,
Style = new Style {
Padding = "",
BackgroundColor = "",
BackgroundImage = "",
BackgroundImageLayout = BackgroundImageLayout.None,
Height = null
}
},
ShowColon = false
};

Controls.Add(this);

BaseComponent default_form1Component = new BaseComponent {
Id = "Form1",
Type = "Form",
ParentId = "",
DesignerProps = new DesignerProps {
AllowAutoClear = false,
Layout = new ContainerLayout {
Width = null,
Visible = true,
ClientVisible = true,
Padding = "",
},
},
Items = new List<string> {
"Section1",
},
Properties = this,
ViewProperties = "",
};

AddToViewItems("default", default_form1Component);

Section1 = new Section {
ControlId = "2b0f2aad-25ea-456d-afa4-dd11b641cbfa",
Name = "Section1",
ServerEvents = new List<EventItem> {
},
ClientEvents = new List<EventItem> {
},
DesignerProps = new DesignerProps {
AllowAutoClear = true,
Layout = new ContainerLayout {
Width = null,
Visible = true,
ClientVisible = true,
Padding = "0 0 0 0",
},
},
Items = new List<string> {
"Column1",
},
Layout = new ContainerLayout {
Width = null,
Visible = true,
ClientVisible = true,
Padding = "0 0 0 0",
},
};


BaseComponent default_section1Component = new BaseComponent {
Id = "Section1",
Type = "Section",
ParentId = "Form1",
DesignerProps = new DesignerProps {
AllowAutoClear = true,
Layout = new ContainerLayout {
Width = null,
Visible = true,
ClientVisible = true,
Padding = "0 0 0 0",
},
},
Items = new List<string> {
"Column1",
},
Properties = Section1,
ViewProperties = "",
};

AddToViewItems("default", default_section1Component);
Controls.Add(Section1);

Column1 = new Column {
ControlId = "49038745-34d8-4a39-bc9d-fe8e0720b9a2",
Name = "Column1",
ServerEvents = new List<EventItem> {
},
ClientEvents = new List<EventItem> {
},
DesignerProps = new DesignerProps {
AllowAutoClear = true,
Layout = new ContainerLayout {
Width = null,
Visible = true,
ClientVisible = true,
Padding = "0px 10px 0px 10px",
},
},
Items = new List<string> {
},
Layout = new ContainerLayout {
Width = null,
Visible = true,
ClientVisible = true,
Padding = "0px 10px 0px 10px",
},
};


BaseComponent default_column1Component = new BaseComponent {
Id = "Column1",
Type = "Column",
ParentId = "Section1",
DesignerProps = new DesignerProps {
AllowAutoClear = true,
Layout = new ContainerLayout {
Width = null,
Visible = true,
ClientVisible = true,
Padding = "0px 10px 0px 10px",
},
},
Items = new List<string> {
},
Properties = Column1,
ViewProperties = "",
};

AddToViewItems("default", default_column1Component);
Controls.Add(Column1);

        }

        // initialize user events
        public override void InitUserEvents()
        {
            

        }
    }
}