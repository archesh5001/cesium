/*global define*/
define(['../Core/createGuid',
        '../Core/Cartographic',
        '../Core/Color',
        '../Core/defineProperties',
        '../Core/DeveloperError',
        '../Core/Ellipsoid',
        '../Core/Event',
        '../Core/loadJson',
        './ConstantProperty',
        './DynamicObject',
        './DynamicPoint',
        './DynamicPolyline',
        './DynamicPolygon',
        './DynamicMaterialProperty',
        './DynamicObjectCollection',
        '../ThirdParty/when'], function(
                createGuid,
                Cartographic,
                Color,
                defineProperties,
                DeveloperError,
                Ellipsoid,
                Event,
                loadJson,
                ConstantProperty,
                DynamicObject,
                DynamicPoint,
                DynamicPolyline,
                DynamicPolygon,
                DynamicMaterialProperty,
                DynamicObjectCollection,
                when) {
    "use strict";

    //DynamicPosiionProperty is pretty hard to use with non-CZML based data
    //For now we create two of our own properties for exposing GeoJSON
    //data.
    var ConstantPositionProperty = function(value) {
        this._value = value;
    };

    ConstantPositionProperty.prototype.getValue = function(time, result) {
        var value = this._value;
        if (typeof value.clone === 'function') {
            return value.clone(result);
        }
        return value;
    };

    ConstantPositionProperty.prototype.setValue = function(value) {
        this._value = value;
    };

    /**
     * A {@link DataSource} which processes GeoJSON.  Since GeoJSON has no standard for styling content,
     * we provide default graphics via the defaultPoint, defaultLine, and defaultPolygon properties.
     * Any changes to these objects will affect the resulting {@link DynamicObject} collection.
     * @alias GeoJsonDataSource
     * @constructor
     *
     * @see DataSourceDisplay
     * @see <a href='http://www.geojson.org/'>GeoJSON specification</a>.
     *
     * @example
     * //Use a billboard instead of a point.
     * var dataSource = new GeoJsonDataSource();
     * var defaultPoint = dataSource.defaulPoint;
     * defaultPoint.point = undefined;
     * var billboard = new DynamicBillboard();
     * billboard.image = new ConstantProperty('image.png');
     * defaultPoint.billboard = billboard;
     * dataSource.loadUrl('sample.geojson');
     */
    var GeoJsonDataSource = function() {
        //default point
        var defaultPoint = new DynamicObject('GeoJsonDataSource.defaultPoint');
        var point = new DynamicPoint();
        point.color = new ConstantProperty(Color.YELLOW);
        point.pixelSize = new ConstantProperty(10);
        point.outlineColor = new ConstantProperty(Color.BLACK);
        point.outlineWidth = new ConstantProperty(1);
        defaultPoint.point = point;

        //default line
        var defaultLine = new DynamicObject('GeoJsonDataSource.defaultLine');
        var polyline = new DynamicPolyline();
        polyline.color = new ConstantProperty(Color.YELLOW);
        polyline.width = new ConstantProperty(2);
        polyline.outlineColor = new ConstantProperty(Color.BLACK);
        polyline.outlineWidth = new ConstantProperty(1);
        defaultLine.polyline = polyline;

        //default polygon
        var defaultPolygon = new DynamicObject('GeoJsonDataSource.defaultPolygon');
        var polygonMaterial = new DynamicMaterialProperty();
        polyline = new DynamicPolyline();
        polyline.color = new ConstantProperty(Color.YELLOW);
        polyline.width = new ConstantProperty(1);
        polyline.outlineColor = new ConstantProperty(Color.BLACK);
        polyline.outlineWidth = new ConstantProperty(0);
        defaultPolygon.polyline = polyline;
        var polygon = new DynamicPolygon();
        polygon.material = polygonMaterial;
        polygonMaterial.processCzmlIntervals({
            solidColor : {
                color : {
                    rgba : [255, 255, 0, 25]
                }
            }
        }, undefined, undefined);
        defaultPolygon.polygon = polygon;

        this._changed = new Event();
        this._error = new Event();
        this._dynamicObjectCollection = new DynamicObjectCollection();

        /**
         * Gets or sets the default graphics to be applied to GeoJson Point and MultiPoint geometries.
         * @type DynamicObject
         */
        this.defaultPoint = defaultPoint;

        /**
         * Gets or sets the default graphics to be applied to GeoJson LineString and MultiLineString geometries.
         * @type DynamicObject
         */
        this.defaultLine = defaultLine;

        /**
         * Gets or sets the default graphics to be applied to GeoJson Polygon and MultiPolygon geometries.
         * @type DynamicObject
         */
        this.defaultPolygon = defaultPolygon;
    };

    /**
     * Gets an event that will be raised when non-time-varying data changes
     * or if the return value of getIsTimeVarying changes.
     * @memberof GeoJsonDataSource
     *
     * @returns {Event} The event.
     */
    GeoJsonDataSource.prototype.getChangedEvent = function() {
        return this._changed;
    };

    /**
     * Gets an event that will be raised if an error is encountered during processing.
     * @memberof GeoJsonDataSource
     *
     * @returns {Event} The event.
     */
    GeoJsonDataSource.prototype.getErrorEvent = function() {
        return this._error;
    };

    /**
     * Since GeoJson is a static format, this function always returns undefined.
     * @memberof GeoJsonDataSource
     */
    GeoJsonDataSource.prototype.getClock = function() {
        return undefined;
    };

    /**
     * Gets the DynamicObjectCollection generated by this data source.
     * @memberof GeoJsonDataSource
     *
     * @returns {DynamicObjectCollection} The collection of objects generated by this data source.
     */
    GeoJsonDataSource.prototype.getDynamicObjectCollection = function() {
        return this._dynamicObjectCollection;
    };

    /**
     * Gets a value indicating if the data varies with simulation time.  If the return value of
     * this function changes, the changed event will be raised.
     * @memberof GeoJsonDataSource
     *
     * @returns {Boolean} True if the data is varies with simulation time, false otherwise.
     */
    GeoJsonDataSource.prototype.getIsTimeVarying = function() {
        return false;
    };

    /**
     * Asynchronously loads the GeoJSON at the provided url, replacing any existing data.
     *
     * @param {Object} url The url to be processed.
     *
     * @returns {Promise} a promise that will resolve when the GeoJSON is loaded.
     *
     * @exception {DeveloperError} url is required.
     */
    GeoJsonDataSource.prototype.loadUrl = function(url) {
        if (typeof url === 'undefined') {
            throw new DeveloperError('url is required.');
        }

        var dataSource = this;
        return loadJson(url).then(function(geoJson) {
            return dataSource.load(geoJson, url);
        }, function(error) {
            dataSource._error.raiseEvent(dataSource, error);
        });
    };

    /**
     * Asynchronously loads the provided GeoJSON object, replacing any existing data.
     *
     * @param {Object} geoJson The object to be processed.
     * @param {String} [source] The base URI of any relative links in the geoJson object.
     *
     * @returns {Promise} a promise that will resolve when the GeoJSON is loaded.
     *
     * @exception {DeveloperError} geoJson is required.
     * @exception {DeveloperError} Unsupported GeoJSON object type.
     * @exception {DeveloperError} crs is null.
     * @exception {DeveloperError} crs.properties is undefined.
     * @exception {DeveloperError} Unknown crs name.
     * @exception {DeveloperError} Unable to resolve crs link.
     * @exception {DeveloperError} Unknown crs type.
     */
    GeoJsonDataSource.prototype.load = function(geoJson, source) {
        if (typeof geoJson === 'undefined') {
            throw new DeveloperError('geoJson is required.');
        }

        var typeHandler = geoJsonObjectTypes[geoJson.type];
        if (typeof typeHandler === 'undefined') {
            throw new DeveloperError('Unsupported GeoJSON object type: ' + geoJson.type);
        }

        //Check for a Coordinate Reference System.
        var crsPromise;
        var crs = geoJson.crs;
        if (typeof crs !== 'undefined') {
            if (crs === null) {
                throw new DeveloperError('crs is null.');
            }
            if (typeof crs.properties === 'undefined') {
                throw new DeveloperError('crs.properties is undefined.');
            }

            var properties = crs.properties;
            if (crs.type === 'name') {
                var crsFunction = GeoJsonDataSource.crsNames[properties.name];
                if (typeof crsFunction === 'undefined') {
                    throw new DeveloperError('Unknown crs name: ' + properties.name);
                }

                crsPromise = when(crsFunction, function(crsFunction) {
                    var deferred = when.defer();
                    deferred.resolve(crsFunction);
                    return deferred.promise;
                });
            } else if (crs.type === 'link') {
                var handler = GeoJsonDataSource.crsLinkHrefs[properties.href];
                if (typeof handler === 'undefined') {
                    handler = GeoJsonDataSource.crsLinkTypes[properties.type];
                }

                if (typeof handler === 'undefined') {
                    throw new DeveloperError('Unable to resolve crs link: ' + JSON.stringify(properties));
                }

                crsPromise = handler(properties);
            } else {
                throw new DeveloperError('Unknown crs type: ' + crs.type);
            }
        } else {
            //Use the default
            crsPromise = when(defaultCrsFunction, function(defaultCrsFunction) {
                var deferred = when.defer();
                deferred.resolve(defaultCrsFunction);
                return deferred.promise;
            });
        }

        this._dynamicObjectCollection.clear();

        var that = this;
        return crsPromise.then(function(crsFunction) {
            typeHandler(that, geoJson, geoJson, crsFunction, source);
            that._changed.raiseEvent(that);
        });
    };

    function defaultCrsFunction(coordinates) {
        var cartographic = Cartographic.fromDegrees(coordinates[0], coordinates[1], coordinates[2]);
        return Ellipsoid.WGS84.cartographicToCartesian(cartographic);
    }

    /**
     * An object that maps the name of a crs to a callback function
     * which takes a GeoJson coordinate and transforms it into a
     * WGS84 Earth-fixed Cartesian.
     * @memberof GeoJsonDataSource
     * @type Object
     */
    GeoJsonDataSource.crsNames = {
        'urn:ogc:def:crs:OGC:1.3:CRS84' : defaultCrsFunction,
        'EPSG:4326' : defaultCrsFunction
    };

    /**
     * An object that maps the href property of a crs link to a callback function
     * which takes the crs properties object and returns a Promise that resolves
     * to a function that takes a GeoJson coordinate and transforms it into a WGS84 Earth-fixed Cartesian.
     * Items in this object take precedence over those defined in <code>crsLinkHrefs</code>, assuming
     * the link has a type specified.
     * @memberof GeoJsonDataSource
     * @type Object
     */
    GeoJsonDataSource.crsLinkHrefs = {};

    /**
     * An object that maps the type property of a crs link to a callback function
     * which takes the crs properties object and returns a Promise that resolves
     * to a function that takes a GeoJson coordinate and transforms it into a WGS84 Earth-fixed Cartesian.
     * Items in <code>crsLinkHrefs</code> take precedence over this object.
     * @memberof GeoJsonDataSource
     * @type Object
     */
    GeoJsonDataSource.crsLinkTypes = {};

    //GeoJson specifies only the Feature object has a usable id property
    //But since "multi" geometries create multiple dynamicObject,
    //we can't use it for them either.
    function createObject(geojson, dynamicObjectCollection) {
        var id = geojson.id;
        if (typeof id === 'undefined' || geojson.type !== 'Feature') {
            id = createGuid();
        } else {
            var i = 2;
            var finalId = id;
            while (typeof dynamicObjectCollection.getObject(finalId) !== 'undefined') {
                finalId = id + "_" + i;
                i++;
            }
            id = finalId;
        }
        var dynamicObject = dynamicObjectCollection.getOrCreateObject(id);
        dynamicObject.geoJson = geojson;
        return dynamicObject;
    }

    // GeoJson processing functions
    function processFeature(dataSource, feature, notUsed, crsFunction, source) {
        if (typeof feature.geometry === 'undefined') {
            throw new DeveloperError('feature.geometry is required.');
        }

        if (feature.geometry === null) {
            //Null geometry is allowed, so just create an empty dynamicObject instance for it.
            createObject(feature, dataSource._dynamicObjectCollection);
        } else {
            var geometryType = feature.geometry.type;
            var geometryHandler = geometryTypes[geometryType];
            if (typeof geometryHandler === 'undefined') {
                throw new DeveloperError('Unknown geometry type: ' + geometryType);
            }
            geometryHandler(dataSource, feature, feature.geometry, crsFunction, source);
        }
    }

    function processFeatureCollection(dataSource, featureCollection, notUsed, crsFunction, source) {
        var features = featureCollection.features;
        for ( var i = 0, len = features.length; i < len; i++) {
            processFeature(dataSource, features[i], undefined, crsFunction, source);
        }
    }

    function processGeometryCollection(dataSource, geoJson, geometryCollection, crsFunction, source) {
        var geometries = geometryCollection.geometries;
        for ( var i = 0, len = geometries.length; i < len; i++) {
            var geometry = geometries[i];
            var geometryType = geometry.type;
            var geometryHandler = geometryTypes[geometryType];
            if (typeof geometryHandler === 'undefined') {
                throw new DeveloperError('Unknown geometry type: ' + geometryType);
            }
            geometryHandler(dataSource, geoJson, geometry, crsFunction, source);
        }
    }

    function processPoint(dataSource, geojson, geometry, crsFunction, source) {
        var dynamicObject = createObject(geojson, dataSource._dynamicObjectCollection);
        dynamicObject.merge(dataSource.defaultPoint);
        dynamicObject.position = new ConstantPositionProperty(crsFunction(geometry.coordinates));
    }

    function processMultiPoint(dataSource, geojson, geometry, crsFunction, source) {
        var coordinates = geometry.coordinates;
        for ( var i = 0; i < coordinates.length; i++) {
            var dynamicObject = createObject(geojson, dataSource._dynamicObjectCollection);
            dynamicObject.merge(dataSource.defaultPoint);
            dynamicObject.position = new ConstantPositionProperty(crsFunction(coordinates[i]));
        }
    }

    function processLineString(dataSource, geojson, geometry, crsFunction, source) {
        var dynamicObject = createObject(geojson, dataSource._dynamicObjectCollection);

        var coordinates = geometry.coordinates;
        var positions = new Array(coordinates.length);
        for ( var i = 0; i < coordinates.length; i++) {
            positions[i] = crsFunction(coordinates[i]);
        }
        dynamicObject.merge(dataSource.defaultLine);
        dynamicObject.vertexPositions = new ConstantPositionProperty(positions);
    }

    function processMultiLineString(dataSource, geojson, geometry, crsFunction, source) {
        var lineStrings = geometry.coordinates;
        for ( var i = 0; i < lineStrings.length; i++) {
            var lineString = lineStrings[i];
            var dynamicObject = createObject(geojson, dataSource._dynamicObjectCollection);
            var positions = new Array(lineString.length);
            for ( var z = 0; z < lineString.length; z++) {
                positions[z] = crsFunction(lineString[z]);
            }
            dynamicObject.merge(dataSource.defaultLine);
            dynamicObject.vertexPositions = new ConstantPositionProperty(positions);
        }
    }

    function processPolygon(dataSource, geojson, geometry, crsFunction, source) {
        var dynamicObject = createObject(geojson, dataSource._dynamicObjectCollection);

        //TODO Holes
        var coordinates = geometry.coordinates[0];
        var positions = new Array(coordinates.length);
        for ( var i = 0; i < coordinates.length; i++) {
            positions[i] = crsFunction(coordinates[i]);
        }
        dynamicObject.merge(dataSource.defaultPolygon);
        dynamicObject.vertexPositions = new ConstantPositionProperty(positions);
    }

    function processMultiPolygon(dataSource, geojson, geometry, crsFunction, source) {
        var polygons = geometry.coordinates;
        for ( var i = 0; i < polygons.length; i++) {
            var polygon = polygons[i];
            var dynamicObject = createObject(geojson, dataSource._dynamicObjectCollection);

            //TODO holes
            var vertexPositions = polygon[0];
            for ( var q = 0; q < vertexPositions.length; q++) {
                var positions = new Array(vertexPositions.length);
                for ( var z = 0; z < vertexPositions.length; z++) {
                    positions[z] = crsFunction(vertexPositions[z]);
                }
                dynamicObject.merge(dataSource.defaultPolygon);
                dynamicObject.vertexPositions = new ConstantPositionProperty(positions);
            }
        }
    }

    var geoJsonObjectTypes = {
        Feature : processFeature,
        FeatureCollection : processFeatureCollection,
        GeometryCollection : processGeometryCollection,
        LineString : processLineString,
        MultiLineString : processMultiLineString,
        MultiPoint : processMultiPoint,
        MultiPolygon : processMultiPolygon,
        Point : processPoint,
        Polygon : processPolygon
    };

    var geometryTypes = {
        GeometryCollection : processGeometryCollection,
        LineString : processLineString,
        MultiLineString : processMultiLineString,
        MultiPoint : processMultiPoint,
        MultiPolygon : processMultiPolygon,
        Point : processPoint,
        Polygon : processPolygon
    };

    return GeoJsonDataSource;
});