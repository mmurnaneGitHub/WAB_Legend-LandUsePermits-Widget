///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 - 2017 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define([
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/_base/html',
    'dojo/on',
    './Utils',
        './d3', //MJM (from https://d3js.org/)
        'esri/layers/FeatureLayer',  //MJM
        'esri/Color',  //MJM
        'esri/symbols/SimpleLineSymbol',  //MJM
        'esri/symbols/SimpleMarkerSymbol',  //MJM
        'esri/renderers/SimpleRenderer',  //MJM
        'esri/graphic',  //MJM
        'dojo/_base/array',  //MJM
        'esri/InfoTemplate',  //MJM
        'esri/geometry/Point',  //MJM
        'esri/geometry/webMercatorUtils',  //MJM
        'dijit/form/DateTextBox',  //MJM - https://dojotoolkit.org/reference-guide/1.10/dijit/form/DateTextBox.html
        'dijit/form/ComboBox',  //MJM
        'dojo/store/Memory', 'dijit/form/FilteringSelect',  //MJM
        'dijit/form/CheckBox', //MJM
        'dijit/form/TextBox',  //MJM
        'dijit/form/Button',  //MJM
    'dijit/_WidgetsInTemplateMixin',
    'jimu/BaseWidget',
    'jimu/LayerInfos/LayerInfos',
    'esri/dijit/Legend'
], function(declare, lang, html, on, legendUtils,
        d3, FeatureLayer, Color, SimpleLineSymbol, SimpleMarkerSymbol, SimpleRenderer, Graphic, array, InfoTemplate, Point, webMercatorUtils, DateTextBox, ComboBox, Memory, FilteringSelect, CheckBox, TextBox, Button, 
_WidgetsInTemplateMixin, BaseWidget, LayerInfos, Legend) {

  var clazz = declare([BaseWidget, _WidgetsInTemplateMixin], {
    name: 'Legend',
    baseClass: 'jimu-widget-legend',
    legend: null,
    _jimuLayerInfos: null,


    startup: function() {
      this.inherited(arguments);
      /* MJM - Add feature layer to map --------------------------------------------------------------
           Sample: https://developers.arcgis.com/javascript/3/jssamples/fl_featureCollection.html
                    https://developers.arcgis.com/javascript/3/jssamples/fl_clustering_types_filter.html
           Class: FeatureLayer - https://developers.arcgis.com/javascript/3/jsapi/featurelayer-amd.html
            CivicData Land Use Table: http://www.civicdata.com/dataset/landusenotices_v10_17460/resource/d7684daa-180b-43fa-9cbd-f9460de58121
            JSON Call (works, text in browser, need limit variable or else get only the first 100 records): 
              http://www.civicdata.com/api/3/action/datastore_search?resource_id=d7684daa-180b-43fa-9cbd-f9460de58121&limit=10000
            API Call: http://www.civicdata.com/api/action/datastore_search?resource_id=d7684daa-180b-43fa-9cbd-f9460de58121
            OTHER JSON Call (text in browser, first 100 records): http://www.civicdata.com/api/3/action/datastore_search?resource_id=d7684daa-180b-43fa-9cbd-f9460de58121
            OTHER JSON Call (download file in browser): http://www.civicdata.com/datastore/json/d7684daa-180b-43fa-9cbd-f9460de58121/
            CSV Call: http://www.civicdata.com/datastore/dump/d7684daa-180b-43fa-9cbd-f9460de58121
        */
      // Use proxy if the server doesn't support CORS
      //esriConfig.defaults.io.proxyUrl = "/website/HistoricMap/proxy/proxy.ashx"; //not working - adding csv to end

      //GLOBAL VARIABLES (no var)
      permitNumberSearch = false; //Update variable for checking if doing a permit number search
      json1 = json_Open = json_PublicComment = json_Decision = json_Process = null; //D3 queries 
      //Modify Widget.html on 'startup' to add query results section (want it below legend, which gets recreated on every open) - MJM
      var newEl = document.createElement('div');
      newEl.innerHTML = '<div id="queryResults"></div>';
      this.domNode.parentNode.insertBefore(newEl, this.domNode.nextSibling);
      //End Modify Widget.html -------------------------------------------------------------------------------------------------
      featureLayer = featureLayerQuery = null; //map layers
      //Layer Symbology
      var allPermits = new Color([255, 153, 0, 0.5]); // All Permits symbol fill color - orange
      var marker = new SimpleMarkerSymbol("solid", 25, new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([89, 95, 35]), 1), allPermits);
      var renderer = new SimpleRenderer(marker);
      //QueryLayer Symbology
      var colorQuery = new Color([255, 255, 0, 0.25]); //yellow
      var markerQuery = new SimpleMarkerSymbol("solid", 25, new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([89, 95, 35]), 1), colorQuery);
      var rendererQuery = new SimpleRenderer(markerQuery);
      //Map Popup Template
      var template = new InfoTemplate("Permit ${RecordNumber}",
        "<b>Address:</b> ${Address}" +
        "<br> <b>Parcel Number:</b> ${ParcelNumber}" +
        "<br> <b>Status:</b> ${Status}" +
        "<br> <b>Description:</b> ${Description}" +
        "<br> <b>Notice Date:</b> ${NoticeDate}" +
        "<br> <b>Public Comment Date:</b> ${PublicCommentDate}" +
        "<br> <b>Appeal End Date:</b> ${AppealEndDate}" +
        "<br> <b>Decision Date:</b> ${DecisionDate}" +
        "<br> <a target='_blank' href='${Link}' >More information</a>" +
        "<br> <a target='_blank' href='https://wspdsmap.cityoftacoma.org/website/Google/StreetView/?lat=${Latitude}&lon=${Longitude}' >Street View</a>"); //popup template: title, content
      //Create feature collection for data
      var featureCollection = {
        "layerDefinition": {
          "geometryType": "esriGeometryPoint",
          "objectIdField": "ObjectID",
          "fields": []
        },
        "featureSet": {
          "features": [],
          "geometryType": "esriGeometryPoint"
        }
      };
      //All Permits - feature layer based on the feature collection ---------------------------
      featureLayer = new FeatureLayer(featureCollection, {
        infoTemplate: template
      });
      featureLayer.title = 'Land Use Permits'; //Legend title
      featureLayer.setRenderer(renderer); //Symbol - needs to be done after layer creation
      //---------------------------------------------------------------------------------------
      //Query Layer----------------------------------------------------------------------------
      featureLayerQuery = new FeatureLayer(featureCollection, {
        infoTemplate: template
      });
      //featureLayerQuery.title = 'Land Use Permits (filtered by permit category)';  //Legend title
      featureLayerQuery.title = 'Land Use Permits (filtered)'; //Legend title
      featureLayerQuery.setRenderer(rendererQuery); //Symbol - do after layer creation
      //---------------------------------------------------------------------------------------
      this.map.addLayers([featureLayer]); //add the feature layer to the map
      this.map.addLayers([featureLayerQuery]); //add the query feature layer to the map
      var currentDate = new Date(); //use .getTime() to get a unique number (milliseconds since January 1, 1970) & force a fresh load of the CivicData json file
      var theJsonFile = "data/LandUseNotices.json?v=x" + currentDate.getDate(); //CivicData json file - add unique day - refresh browser cache if needed (file updated just after midnight)
      this._download_D3(theJsonFile); //D3 Library ----Use to download file and filter - http://learnjsdata.com/read_data.html
      this._extentWatch(); //for running queries whenever extent changes
      this.map.setLevel(this.map.getLevel()); //zoom to default to start _extentWatch working, updating selection sets with map extent
      //FILTER----------------------------------------------------------
      //Category menu ( https://dojotoolkit.org/reference-guide/1.10/dijit/form/FilteringSelect.html - need 'dojo/store/Memory', 'dijit/form/FilteringSelect')
      var categoryStore = new Memory({
        data: [{
            name: "All",
            id: "All"
          },
          {
            name: "Final",
            id: "Decision"
          },
           {
            name: "Open for Appeal",
            id: "Open"
          },
          {
            name: "Permit in Process",
            id: "Process"
          },
         {
            name: "Public Comment",
            id: "PublicComment"
          }
        ]
      });
      var filteringSelect = new FilteringSelect({
        value: "All",
        store: categoryStore,
        style: "width: 160px;",
        onChange: lang.hitch(this, this._queryCategory)
      }, "categorySelect").startup();
      new Button({  //Create a button to search by Category
        showLabel: false,
        label: 'Find Category', // analogous to title when showLabel is false
        iconClass: 'dijitEditorIconSpace', //empty image - place real image below
        onClick: lang.hitch(this, this._queryCategory)
      }, "buttonCategory").startup();
      new TextBox({  //Create a text box for permit # - https://dojotoolkit.org/api/
        //placeHolder: "LU18-0079",
        placeHolder: "LU18-0079 etc.",
        //placeHolder: "Search for Permit Number like LU18-0079",
        style: "width: 160px;",
        onKeyDown: lang.hitch(this, this._searchPermit) //allows enter key for alternative to button
      }, "PermitNum").startup();
      new Button({  //Create a button to search permit #
        showLabel: false,
        label: 'Find Permit Number', // analogous to title when showLabel is false
        iconClass: 'dijitEditorIconSpace', //empty image - place real image below
        onClick: lang.hitch(this, this._searchPermit)
      }, "buttonPermitNum").startup();
      //Stle buttons after startup to override defaults
      dojo.style("buttonCategory", "height", "20px");
      dojo.style("buttonCategory", "width", "18px");
      dojo.style("buttonCategory", 'background-image', 'url(images/dataSearchIcon.png)');
      dojo.style("buttonPermitNum", "height", "20px");
      dojo.style("buttonPermitNum", "width", "18px");
      dojo.style("buttonPermitNum", 'background-image', 'url(images/dataSearchIcon.png)');
      //end FILTER ----------------------------------------------------------------------
      this._updateAllPermits(); //update All permits object with downloaded data 
      //end MJM layer ---------------------------------------------------------------------------------
    },

    onOpen: function() {
      this._jimuLayerInfos = LayerInfos.getInstanceSync();
      var legendParams = {
        arrangement: this.config.legend.arrangement,
        autoUpdate: this.config.legend.autoUpdate,
        respectCurrentMapScale: this.config.legend.respectCurrentMapScale,
        //respectVisibility: false,
        map: this.map,
        layerInfos: this._getLayerInfosParam()
      };
      this.legend = new Legend(legendParams, html.create("div", {}, this.domNode));
      this.legend.startup();
      this._bindEvent();
    },

    onClose: function() {
      this.legend.destroy();
    },

    //START MJM FUNCTIONS ------------------------------------------------------------------------------
    _download_D3: function(json) {
      d3.json(json, this._filter_D3);  //MJM - Use D3 Library to download file - http://learnjsdata.com/read_data.html- https://github.com/d3/d3/wiki#d3_selectAll
    },

    _filter_D3: function(json) {
      //MJM - Use D3 filter to create several data arrays
      var jsonA = json.result.records;  //just use the records portion of the json
      var json1_tmp = jsonA.filter(function(row) { //filter to records with valid location, use Date.parse to compare dates (string value)
          return row['Longitude'] < 0 && row['Latitude'] > 0 && row['Status'] > '';
      });
          if (jsonA.length != json1_tmp.length) {
            console.error(" WARNING: " + json1_tmp.length + " of " + jsonA.length + " used.  Missing records have invalid latitude/longitude or no Status value. No Status records appear in the CivicData table, but don't need to be shown on map.");  
          }
          this.json1 = json1_tmp;  //Update global ALL RECORDS
    },

    _requestLayerQuery: function(myMap, value) {
      //Insert modified JSON here with D3 objects  (use JSON.parse to create object, JSON.stringify to read as string )
      var response = JSON.parse('{\"items\":' + JSON.stringify(value) + '}'); //query data as json object
      var features = [];
      var resultsText = '<b>' + response.items.length + '</b> selected permits in map extent.';
      //console.error(publicComment)

      if (response.items.length == 1) {
        if (permitNumberSearch == true) {
          resultsText = 'Selected by permit number = ' + response.items[0].RecordNumber;
        } else {
          resultsText = 'One selected permit in map extent.';
        }
      }
      if (response.items.length > 1) {
        resultsText += "<br>&nbsp;<br><i><b>NOTE:</b> Multiple permits may occur at one location.  Click marker for permit number and 'Browse Features' for individual permit details.</i>";
      }
      array.forEach(response.items, function(item) { //loop through the items (SELECTED RECORDS) and add to the feature layer
        //Map markers
        var attr = {}; //fill in attributes
        attr["RecordNumber"] = item.RecordNumber;
        attr["Address"] = item.Address;
        attr["ParcelNumber"] = item.ParcelNumber;
        attr["Status"] = item.Status;
        attr["Description"] = item.Description;
        attr["NoticeDate"] = item.NoticeDate;
        attr["PublicCommentDate"] = item.PublicCommentDate;
        attr["AppealEndDate"] = item.AppealEndDate;
        attr["DecisionDate"] = item.DecisionDate;
        attr["Link"] = item.Link;
        attr["Longitude"] = item.Longitude;
        attr["Latitude"] = item.Latitude;
        var geometry = new Point({
          "x": item.Longitude,
          "y": item.Latitude,
          "spatialReference": {
            "wkid": 4326
          }
        }); //Use coordinate field names from data
        var graphic = new Graphic(geometry);
        graphic.setAttributes(attr);
        features.push(graphic);
        //Results text
        resultsText += "<hr color='#acb1db'><br>";
        resultsText += "<b>Permit: </b>" + item.RecordNumber + "<br>";
        resultsText += "<b>Address: </b>" + item.Address + "<br>";
        resultsText += "<b>Parcel Number: </b>" + item.ParcelNumber + "<br>";
        resultsText += "<b>Status: </b>" + item.Status + "<br>";
        resultsText += "<b>Description: </b>" + item.Description + "<br>";
        if (item.NoticeDate !== null && item.NoticeDate !== '') {
          resultsText += "<b>Notice Date: </b>" + item.NoticeDate + "<br>"; //don't show if blank
        }
        if (item.PublicCommentDate !== null && item.PublicCommentDate !== '') {
          resultsText += "<b>Public Comment Date: </b>" + item.PublicCommentDate + "<br>";
        }
        if (item.AppealEndDate !== null && item.AppealEndDate !== '') {
          resultsText += "<b>Appeal End Date: </b>" + item.AppealEndDate + "<br>"; //don't show if blank
        }
        if (item.DecisionDate !== null && item.DecisionDate !== '') {
          resultsText += "<b>Decision Date: </b>" + item.DecisionDate + "<br>";
        }
        resultsText += "<b><a target='_blank' href='" + item.Link + "' >More information</a></b><br>"
        if (item.Longitude < 0 && item.Latitude > 0) { //skip records without coordinates
          resultsText += "<b><a href='https://wspdsmap.cityoftacoma.org/website/Google/StreetView/?lat=" + item.Latitude + "&lon=" + item.Longitude + "' target='_blank'>Street View</a></b><br>";
          resultsText += "<b><a href='javascript:void(0);'  id='" + item.RecordNumber + "' >Zoom to</a></b><br>&nbsp;<br>";
        }
      });
      //Update query layer
      featureLayerQuery.clear(); //Clears all graphics from layer (reset query to zero)
      featureLayerQuery.applyEdits(features, null, null); //Update features in the query layer by adding new features. 
      if (features.length == 1) {
        featureLayerQuery.disableFeatureReduction()
      }; //Disable feature reduction (otherwise continues to have a cluster legend even with one record)
      if (screen.width > 600 && features.length > 1) { //Update cluster for new records: Determine screen size for clusters (popup problem for clusters on mobile in WAB), no need to cluster with one record
        featureLayerQuery.enableFeatureReduction(); //Now make it possible to cluster again
        featureLayerQuery.setFeatureReduction({
          type: "cluster"
        }); //Cluster symbols - experiment with clusterRadius option (default 80) if legend non-integers a problem
      }
      featureLayer.setVisibility(false); //turn off All data layer
      featureLayerQuery.setVisibility(true); //make query layer visible on map
      featureLayerQuery.refresh(); //IMPORTANT: NEED TO USE WHEN CLUSTERING, OTHERWISE LAYER NOT VISIBLE (setFeatureReduction)!!!!! 

      document.getElementById("queryResults").innerHTML = resultsText; //Update result details in legend panel - Widget.html
      array.forEach(response.items, function(item) { //now that widget panel has the html text loop through again and add zoom click event by permit number
        var geometry = new Point({
          "x": item.Longitude,
          "y": item.Latitude,
          "spatialReference": {
            "wkid": 4326
          }
        }); //Use coordinate field names from data
        on(document.getElementById("" + item.RecordNumber + ""), 'click', function() {
          myMap.centerAndZoom(esri.geometry.geographicToWebMercator(new esri.geometry.Point(geometry)), 19)
        });
      });
    },

    _extentWatch: function() {
      //MJM - run whenever map extent changes
      this.own(on(this.map, "extent-change", lang.hitch(this, this._extentWait))); 
    },

    _extentWait: function() {
      //MJM - wait for extent to stop changing
      if (this.sumTimer) {
        clearTimeout(this.sumTimer);
        this.sumTimer = null;
      }
      this.sumTimer = setTimeout(lang.hitch(this, this._extentQuery), 900);
    },

    _extentQuery: function() {
      //MJM - get map extent coordinates and run new query - WebMercator to geographic WGS84 (latitude / longitude)
      if (!permitNumberSearch) { //Do extent query if not currently searching by permit number (suspend otherwise)
        var ext = this.map.extent; //array - ext.normalize() = object
        var lowerLeftLL = webMercatorUtils.xyToLngLat(ext.xmin, ext.ymin);
        var upperRightLL = webMercatorUtils.xyToLngLat(ext.xmax, ext.ymax);

        //1. Update query object with with extent
        this.json_Open = this.json_PublicComment = this.json_Decision = this.json_Process = null; // Reset for D3 queries with new extent
        lang.hitch(this, this._queryPermits(lowerLeftLL, upperRightLL)); //update queries 
        //2. Redraw query layer once queries are updated
        var checkExist2 = setInterval(lang.hitch(this, function() { //Wait for query array to be updated (_filter_D3)- then use for feature layer
          if (document.getElementById("categorySelect").value == 'All') {  //Gets Name Value
            clearInterval(checkExist2); //stop object check - don't need to update map
          } else if (this.json_Open != null && this.json_PublicComment != null && this.json_Decision != null && this.json_Process != null) { //query objects are now updated
            clearInterval(checkExist2);
            //Determine which json to use
            if (document.getElementById("categorySelect").value == 'Public Comment') {
              var theJSON = this.json_PublicComment;
            } else if (document.getElementById("categorySelect").value == 'Final') {
              var theJSON = this.json_Decision;
            } else if (document.getElementById("categorySelect").value == 'Open for Appeal') {
              var theJSON = this.json_Open;
            } else {
              var theJSON = this.json_Process; //Permit in Process
            }
            lang.hitch(this, this._requestLayerQuery(this.map, theJSON)); //update selected permits on map
          } //end object existence check
        }, 100)); // check every 100ms
      }
    },

    _queryCategory: function() {
      if (permitNumberSearch == true) { //was searching by permit #, but now switched to category search
        permitNumberSearch = false; //Update variable for checking if doing a permit number search
        this.map.setLevel(this.map.getLevel() - 1); //Zoom map out one level to trigger map extent select
      }
      if (dijit.byId('categorySelect').get('value') === 'All') { //Update map with current menu category choice (onChange)  - ID VALUE
        featureLayer.setVisibility(true); //turn on all data layer
        featureLayerQuery.setVisibility(false); //turn off query layer
        document.getElementById("queryResults").innerHTML = ""; //empty results details to legend
      } else {
        if (dijit.byId('categorySelect').get('value') === 'PublicComment') {
          lang.hitch(this, this._requestLayerQuery(this.map, this.json_PublicComment)); //update query layer on map
        } else if (dijit.byId('categorySelect').get('value') === 'Decision') {
          lang.hitch(this, this._requestLayerQuery(this.map, this.json_Decision)); //update query layer on map
        } else if (dijit.byId('categorySelect').get('value') === 'Open') {
          lang.hitch(this, this._requestLayerQuery(this.map, this.json_Open)); //update query layer on map
        } else {
          lang.hitch(this, this._requestLayerQuery(this.map, this.json_Process)); //update query layer on map - Permit in Process
        }
      }
    },

    _queryPermits: function(lowerLeftLL, upperRightLL) {
	      //FILTER QUERIES - reset all querieswith new map extent and D3
	       json_PublicComment_tmp = json1.filter(function(row) {
	          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && (row['Status'] == 'Public Comment' || row['Status'] == 'Public Comment Period');
	       });
	          this.json_PublicComment = json_PublicComment_tmp;  //Update global PUBLIC COMMENT RECORDS

	       json_Open_tmp = json1.filter(function(row) {
	          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && row['Status'] == 'Open For Appeal';
	       });
	          this.json_Open = json_Open_tmp;  //Update global OPEN FOR APPEAL RECORDS

	       json_Decision_tmp = json1.filter(function(row) {
	          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && row['Status'] == 'Final';
	       });
	          this.json_Decision = json_Decision_tmp;  //Update global DECISION RECORDS

	       json_Process_tmp = json1.filter(function(row) {
	          return row['Longitude'] > lowerLeftLL['0'] && row['Longitude'] < upperRightLL['0'] && row['Latitude'] > lowerLeftLL['1'] && row['Latitude'] < upperRightLL['1'] && row['Status'] == 'Permit in Process';
	      });
	          this.json_Process = json_Process_tmp;  //Update global PERMIT IN PROCESS RECORDS
    },

	_updateAllPermits: function() {
         var checkExist = setInterval(function() { //Wait for All records array (json1) to be created (_filter_D3)- then use for feature layer
                                //console.error(json_PublicComment)
                                if (json1 != null) {
                                  clearInterval(checkExist);
                                     response = JSON.parse('{\"items\":' + JSON.stringify(json1) + '}'); //ALL RECORDS using D3
                                      var features = [];
                                      array.forEach(response.items, function(item) {  //loop through the items (ALL RECORDS) and add to the feature layer
                                        var attr = {};  //fill in attributes
	                                        attr["RecordNumber"] = item.RecordNumber;
	                                        attr["Address"] = item.Address;
	                                        attr["ParcelNumber"] = item.ParcelNumber;
	                                        attr["Status"] = item.Status;
	                                        attr["Description"] = item.Description;
	                                        attr["NoticeDate"] = item.NoticeDate;
	                                        attr["PublicCommentDate"] = item.PublicCommentDate;
									        attr["AppealEndDate"] = item.AppealEndDate;
									        attr["DecisionDate"] = item.DecisionDate;
	                                        attr["Link"] = item.Link;
                                            attr["Longitude"] = item.Longitude;
                                            attr["Latitude"] = item.Latitude;
                                        var geometry = new Point( {"x": item.Longitude, "y": item.Latitude, "spatialReference": {"wkid": 4326 } });    //Use data coordinate field names
                                        var graphic = new Graphic(geometry);
	                                        graphic.setAttributes(attr);
	                                        features.push(graphic);
                                      });

                                      featureLayer.applyEdits(features, null, null); //Apply edits to the feature layer. Updates layer.
                                      if (screen.width>600) {  //Determine screen size for clusters (popup problem for clusters on mobile in WAB)
                                        featureLayer.setFeatureReduction({type: "cluster"}); //Cluster symbols
                                      }

		                                featureLayer.setVisibility(false);  //turn off All layer 
		                        } //end object existence check
                            }, 100); // check every 100ms



	         var checkExist2 = setInterval(lang.hitch(this, function() { //Wait for query array to be updated (_filter_D3)- then use for feature layer
	                               if (this.json_PublicComment != null) {  //query objects are now updated
	                                    clearInterval(checkExist2);
	                                    dijit.byId('categorySelect').set('value', 'PublicComment');  //Select 'Public Comment' from menu now that query object exists
	                               } //end object existence check
	                            }, 100)); // check every 100ms
	},

    _searchPermit: function(event) { //MJM - Find by permit number
      if (event.keyCode == 13 || event.buttons == 0) { // Run only if enter key in input box (13) or left mouse-click on search button (0) 
        permitNumberSearch = true; //Update variable for checking if doing a permit number search
        json_PermitNumber = json1.filter(function(row) { //Filter by Permit Number from text box
          //return row['RecordNumber'] == document.getElementById("PermitNum").value.trim();
          return row['RecordNumber'] == document.getElementById("PermitNum").value.trim().toUpperCase(); //Remove whitespace from both sides of a string, change to upper case
        });
        if (json_PermitNumber.length) { //permit found
          var geometry = new Point({ //Permit coordinates
            "x": json_PermitNumber[0].Longitude,
            "y": json_PermitNumber[0].Latitude,
            "spatialReference": {
              "wkid": 4326
            }
          });
          this.map.centerAndZoom(geometry, 18); //Use permit coordinates to zoom map to level 18
          lang.hitch(this, this._requestLayerQuery(this.map, json_PermitNumber)); //Update query layer on map
        } else {
          alert('Permit number ' + document.getElementById("PermitNum").value.trim() + ' not found.')
        }
      }
    },
    //END MJM FUNCTIONS ------------------------------------------------------------------------------

    _bindEvent: function() {
      if(this.config.legend.autoUpdate) {
        this.own(on(this._jimuLayerInfos,
                    'layerInfosIsShowInMapChanged',
                    lang.hitch(this, 'refreshLegend')));

        this.own(on(this._jimuLayerInfos,
                    'layerInfosChanged',
                    lang.hitch(this, 'refreshLegend')));

        this.own(on(this._jimuLayerInfos,
                    'layerInfosRendererChanged',
                    lang.hitch(this, 'refreshLegend')));
      }
    },

    _getLayerInfosParam: function() {
      var layerInfosParam;
      if(this.config.legend.layerInfos === undefined) {
        // widget has not been configed.
        layerInfosParam = legendUtils.getLayerInfosParam();
      } else {
        // widget has been configed, respect config.
        layerInfosParam = legendUtils.getLayerInfosParamByConfig(this.config.legend);
      }

      // filter layerInfosParam
      //return this._filterLayerInfsParam(layerInfosParam);
      return layerInfosParam;
    },

    refreshLegend: function() {
      var layerInfos = this._getLayerInfosParam();
      this.legend.refresh(layerInfos);
    }

  });
  return clazz;
});
