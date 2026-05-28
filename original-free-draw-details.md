free draw tool

cesium cersion: "^1.93.0"

Form Layout: Create the basic form structure with the required fields (Name, ID, Source, Coordinates, Radius (Circle only), Color, Line Type, Line Width).
Shape-Specific Fields: Conditionally display/hide fields based on the selected shape type (e.g., Radius for Circle only).
Coordinate Input: Implement coordinate input fields with the ability to add/remove coordinates for Polygon shapes.
Map Integration: Integrate the form with the map to automatically populate coordinate fields when dragging/stretching shapes.
Dropdown Population: Populate the dropdown menus for Color, Line Type, and Line Width with appropriate options.
Save Button Logic: Implement the logic to call the backend API to save the shape data. Enable/disable the button based on form validation.
Cancel Button Logic: Implement the logic to either empty the form or revert to the last saved version.
Error Handling: Display appropriate error messages to the user if the backend API returns errors.
Form Opening/Replacement: Implement the logic to ensure only one form instance is open at a time and that new forms replace existing ones. Position the form correctly.
ID & Source Display: Display the ID and Source fields as read-only.

UIDD

Map Toolbar - Free Draw tool Name
Free Draw tool has two states:
• View only Mode (Default) – Free Draw Layers are locked for editing, means that shapes are unavailable for select, drag, delete etc. Layers Management Tool enables to Show/Hide layers as necessary (refer to paragraph 4.1.6.7).
• Edit Mode - Free Draw tool menu, includes Text and shapes options and remain opened above Map section until Edit Mode will be exit.
Description

Map Toolbar - Free Draw tool Graphics and states

          <image of closed tool with lock icon up top corner>    <menu open from above the button on right direction>
     Before click (locked)                                     After click (unlocked)

Map Toolbar - Free Draw tool Graphics and states

Enter to Edit Mode: by clicking on Free Draw tool button. Tool menu opens above Map section and unlock icon appears on the button. Only then (Edit Mode) all other operation described below, including selection and CM are available.

Create new shape (for Free Draw Property Form refer to paragraph 4.1.15):
• Text button – mouse cursor will turn into a cross for map operations and a Text Property Form will open as well.
• Line button – mouse cursor will turn into a cross for map operations and a Line Property Form will open as well.
• Circle button – mouse cursor will turn into a cross for map operations and a Circle Property Form will open as well.
• Polygon button – mouse cursor will turn into a cross for map operations and a Polygon Property Form will open as well.

Map operation:
• Shape selection: as any other entity selection on map.
• Shape dragging: as any other entity dragging on map.
• Shape stretching: first shape selects and then change its proportions by dragging the dots according to shape.

CM on Free draw shapes (refer to paragraph 3.6.6):
• Open Free Draw Property Form (refer to paragraph 4.1.15).
• Delete – deletes the shape without any confirmation window.

Exit Edit Mode: by clicking again on Free Draw tool button. Tool menu will close and Free Draw mode returns to View only mode. Lock icon appears on the button. Operation logic

Free Draw Property Form Name
Free Draw Property Form enables creating a new shape or editing exist shape. For form opening description refer to paragraph 4.1.6.6. The Form opening location is over the GEO Entities and Plan list section.
NOTE
The form opening location is over the GEO Entities and Plan list section and cannot be dragged.
Only one form can be opened. when the user tries to open another form, the new one will replace the previous one.
The form includes the following:
• Form header – "shape: xxxxx" (according to shape type).
• There are four form types:
o Text property form.
o Circle property form
o Line property form.
o Polygon property form.

NOTE
The form structure and fields are very similar between shape types. Differences will be described below.

• Save – enables shape saving.
• Cancel – enables to return to last saved version or empty form (in case of an unsaved shape). Description

Free Draw Property Form – Text

Free Draw Property Form – Circle

Free Draw Property Form – Line

Free Draw Property Form – Polygon Graphics and states
Name:
• Editable field.

ID:
• Read only field - auto filled on save operation.

Source:
• Read only field - auto filled.

Coordinates:
• Typing - For supported coordinates format refer to paragraph 2.7. Multi coordinates are for Polygon only. With the ability to Add/Erase coordinates as required.  
• Shape dragging on map will automatically filled coordinates fields.
• Shape stretching on map, by dragging the dots according to shape and change its proportions, will automatically filled coordinates fields.

• Radius (for Circle only) - Editable field.

Text/Line color:
• Selecting from dropdown menu.

Line type (for Circle, Line and Polygon):
• Selecting from dropdown menu.

Line width (for Circle, Line and Polygon):
• Selecting from dropdown menu.

Save button:
• Enable – when a new shape is created and all mandatory fields (coordinates and altitude) are filled or when saved shape is opened and changes have been made.
• Disable – when a new shape is created and not all mandatory fields (coordinates and altitude) are filled or when saved shape is opened and no changes have been made.

Cancel button (X button is identical to Cancel):
• Before save – when a new shape is created and not yet saved, the operation will empty shape (all defaults parameters will be displayed).
• After save – when a saved shape is opened and changes have been made, the operation will return to last saved version of the shape. Operation logic

notes to write in Design md file:
definitions:

- draw action tool are exist in ActionToolsHolderComponent template (works fine do not refactor the code there)
- EditShapeFacadeService are manage all form of edit or create shape of free draw tool
- EditDrawComponent are the form
- drawToolService manage the free draw cesium dataSource and get the edit data from EditShapeFacadeService (observables with valueChanges of each control)
  behavior:
- after clicking on of the option in the draw action tool, edit draw modal opened and the shapeType on drawToolService are stay the same until other option clicked in the draw action tool
- for text and circle shapes, first click in map (or mouse down drag and mouse up for circle)
  drawToolService should create the text /circle shape, after that the next click or drag it edit the position of the existing temp shape
  after save in EditDrawComponent, the shape are become consist in the datasource and the temp entity are reset
  and this process above start again
- only after clicking the button of the draw action tool menu (locate in #freeDrawPopoverElement ref in ActionToolsHolderComponent template)
  drawType becomes 'MapOperationsEnum.DRAW_NONE' all mouse handlers reset, and the EditDrawComponent form disappear (distroyed)
- drag existing shape entity are enabled when the shape are selected
- any shape positions should be synced in the 'points' form Array group that stored in EditShapeFacadeService (for example
  text or circle center should be in points: [{coordinates: {longtitude:<degrees>, latitude:<degrees>}] and so on in the other shapes)
  EditDrawComponent (do not refactor the style, only missing things in template and ts logic)
