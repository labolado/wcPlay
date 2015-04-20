/* Simple JavaScript Inheritance
 * By John Resig http://ejohn.org/
 * MIT Licensed.
 * Modified by Jeff Houde https://play.webcabin.org/
 */
(function(){
  var initializing = false, fnTest = /xyz/.test(function(){xyz;}) ? /\b_super\b/ : /.*/;
 
  // The base Class implementation (does nothing)
  this.Class = function(){};
 
  // Create a new Class that inherits from this class
  Class.extend = function() {
    // First argument is always the class name.
    var className = arguments[0];
    // Full argument list will all be passed into the classInit function call.
    // Last argument is always the class definition.
    var prop = arguments[arguments.length-1];

    var _super = this.prototype;
   
    // Instantiate a base class (but only create the instance,
    // don't run the init constructor)
    initializing = true;
    var prototype = new this(arguments);
    initializing = false;
   
    // Copy the properties over onto the new prototype
    for (var name in prop) {
      // Check if we're overwriting an existing function
      prototype[name] = typeof prop[name] == "function" &&
        typeof _super[name] == "function" && fnTest.test(prop[name]) ?
        (function(name, fn){
          return function() {
            var tmp = this._super;
           
            // Add a new ._super() method that is the same method
            // but on the super-class
            this._super = _super[name];
           
            // The method only need to be bound temporarily, so we
            // remove it when we're done executing
            var ret = fn.apply(this, arguments);        
            this._super = tmp;
           
            return ret;
          };
        })(name, prop[name]) :
        prop[name];
    }
   
    // The dummy class constructor
    function Class() {
      // All construction is actually done in the init method
      if (!initializing) {
        this.init && this.init.apply(this, arguments);
      } else {
        this.classInit && this.classInit.apply(this, arguments[0]);
      }
    }
   
    // Populate our constructed prototype object
    Class.prototype = prototype;
   
    // Enforce the constructor to be what we expect
    Class.prototype.constructor = Class;
 
    // And make this class extendable
    Class.extend = arguments.callee;
   
    window[className] = Class;
  };
})();
/**
 * @class
 * The main scripting engine.
 *
 * @constructor
 * @param {wcPlay~Options} [options] - Custom options.
 */
function wcPlay(options) {
  this._entryNodes = [];
  this._processNodes = [];
  this._compositeNodes = [];
  this._storageNodes = [];

  this._properties = [];

  this._queuedChain = [];
  this._queuedProperties = [];

  this._updateID = 0;
  this._isPaused = false;
  this._isStepping = false;

  this._editors = [];

  // Setup our options.
  this._options = {
    silent: false,
    updateRate: 25,
    updateLimit: 100,
    debugging: true,
  };
  for (var prop in options) {
    this._options[prop] = options[prop];
  }
};

/**
 * Determines how a property's control should be rendered within the editor view.
 * @enum {String}
 */
wcPlay.PROPERTY_TYPE = {
  /** Displays the property based on the type of data it holds. Options depend on the property type it holds, you can include properties from all the types together as they do not share option values. */
  DYNAMIC: 'dynamic',
  /** Displays the property as a checkbox. No options are used. */
  TOGGLE: 'toggle',
  /** Displays the property as a number control. [Number options]{@link wcNode~NumberOptions} are used. */
  NUMBER: 'number',
  /** Displays the property as a text field. [String options]{@link wcNode~StringOptions} are used. */
  STRING: 'string',
  /** Displays the property as a combo box control. [Select options]{@link wcNode~SelectOptions} are used. */
  SELECT: 'select',
};

/**
 * The different types of nodes.
 * @enum {String}
 */
wcPlay.NODE_TYPE = {
  ENTRY: 'entry',
  PROCESS: 'process',
  COMPOSITE: 'composite',
  STORAGE: 'storage',
};

/**
 * A global list of nodes that exist. All node types must add themselves into this list when they are coded.
 * @member
 */
wcPlay.NODE_LIBRARY = [];

/**
 * A global function that registers a new node type into the library. This is called automatically when a new extended node type is defined, you should not have to do this manually.
 * @param {String} name - The name of the node constructor.
 * @param {String} displayName - The display name.
 * @param {String} category - The display category name.
 * @param {wcPlay.NODE_TYPE} type - The node's type.
 * @returns {Boolean} - Success or failure.
 */
wcPlay.registerNodeType = function(name, displayName, category, type) {
  for (var i = 0; i < wcPlay.NODE_LIBRARY.length; ++i) {
    if (wcPlay.NODE_LIBRARY[i].name === name) {
      return false;
    }
  }

  wcPlay.NODE_LIBRARY.push({
    name: name,
    displayName: displayName,
    category: category,
    type: type,
  });
  return true;
}

wcPlay.prototype = {
  /**
   * Initializes the script and begins the update process.
   * @function wcPlay#start
   */
  start: function() {
    this._isPaused = true;

    for (var i = 0; i < this._properties.length; ++i) {
      this._properties[i].value = this._properties[i].initialValue;
    }

    for (var i = 0; i < this._storageNodes.length; ++i) {
      this._storageNodes[i].reset();
    }
    for (var i = 0; i < this._processNodes.length; ++i) {
      this._processNodes[i].reset();
    }
    for (var i = 0; i < this._compositeNodes.length; ++i) {
      this._compositeNodes[i].reset();
    }
    for (var i = 0; i < this._entryNodes.length; ++i) {
      this._entryNodes[i].reset();
    }

    this._queuedChain = [];
    this._queuedProperties = [];

    this._isPaused = false;
    this._isStepping = false;

    if (!this._updateId) {
      var self = this;
      this._updateID = setInterval(function() {
        self.update();
      }, this._options.updateRate);
    }

    this.__notifyNodes('onStart', []);
  },

  /**
   * Clears all nodes from the script.
   * @function wcPlay#clear
   */
  clear: function() {
    this._queuedChain = [];
    this._queuedProperties = [];

    this._properties = [];

    while (this._storageNodes.length) {
      this._storageNodes[0].destroy();
    }
    while (this._processNodes.length) {
      this._processNodes[0].destroy();
    }
    while (this._compositeNodes.length) {
      this._compositeNodes[0].destroy();
    }
    while (this._entryNodes.length) {
      this._entryNodes[0].destroy();
    }
  },

  /**
   * Update handler.
   * @function wcPlay#update
   */
  update: function() {
    // Skip updates on pause.
    if (this._isPaused) {
      return;
    }

    // Update a queued property if any
    var count = Math.min(this._queuedProperties.length, this._options.updateLimit);
    while (count) {
      count--;
      var item = this._queuedProperties.shift();
      item.node._meta.flash = true;
      item.node._meta.paused = false;
      item.node.property(item.name, item.value);
    }

    // Update a queued node entry only if there are no more properties to update.
    if (!this._queuedProperties.length) {
      count = Math.min(this._queuedChain.length, this._options.updateLimit - count);
      while (count) {
        count--;
        var item = this._queuedChain.shift();
        item.node._meta.flash = true;
        item.node._meta.paused = false;
        item.node.onTriggered(item.name);
      }
    }

    // If we are step debugging, pause the script here.
    if (this._isStepping) {
      this._isPaused = true;
    }
  },

  /**
   * Retrieves a node from a given ID, if it exists in this script.
   * @function wcPlay#nodeById
   * @param {Number} id - The ID of the node.
   * @returns {wcNode|null} - Either the found node, or null.
   */
  nodeById: function(id) {
    for (var i = 0; i < this._storageNodes.length; ++i) {
      if (this._storageNodes[i].id === id) {
        return this._storageNodes[i];
      }
    }
    for (var i = 0; i < this._processNodes.length; ++i) {
      if (this._processNodes[i].id === id) {
        return this._processNodes[i];
      }
    }
    for (var i = 0; i < this._compositeNodes.length; ++i) {
      if (this._compositeNodes[i].id === id) {
        return this._compositeNodes[i];
      }
    }
    for (var i = 0; i < this._entryNodes.length; ++i) {
      if (this._entryNodes[i].id === id) {
        return this._entryNodes[i];
      }
    }
    return null;
  },

  /**
   * Gets, or Sets whether the script is running in [silent mode]{@link wcPlay~Options}.
   * @function wcPlay#silent
   * @param {Boolean} silent - If supplied, assigns a new silent state of the script.
   * @returns {Boolean} - The current silent state of the script.
   */
  silent: function(silent) {
    if (silent !== undefined) {
      this._options.silent = silent? true: false;
    }

    return this._options.silent;
  },

  /**
   * Gets, or Sets the debugging state of the script.
   * @function wcPlay#debugging
   * @param {Boolean} [debug] - If supplied, will assign the debugging state of the script.
   * @returns {Boolean} - The current debugging state of the script.
   */
  debugging: function(debug) {
    if (debug !== undefined) {
      this._options.debugging = debug? true: false;
    }

    return this._options.debugging;
  },

  /**
   * Gets, or Sets the pause state of the script.
   * @function wcPlay#paused
   * @param {Boolean} [paused] - If supplied, will assign the paused state of the script.
   * @returns {Boolean} - The current pause state of the script.
   */
  paused: function(paused) {
    if (paused !== undefined) {
      this._isPaused = paused? true: false;
    }

    return this._isPaused;
  },

  /**
   * Gets, or Sets the stepping state of the script.
   * @function wcPlay#stepping
   * @param {Boolean} [stepping] - If supplied, will assign the stepping state of the script.
   * @returns {Boolean} - The current stepping state of the script.
   */
  stepping: function(stepping) {
    if (stepping !== undefined) {
      this._isStepping = stepping? true: false;
    }

    return this._isStepping;
  },

  /**
   * Creates a new global property.
   * @param {String} name - The name of the property.
   * @param {wcPlay.PROPERTY_TYPE} type - The type of property.
   * @param {Object} [initialValue] - A default value for this property.
   * @param {Object} [options] - Additional options for this property, see {@link wcPlay.PROPERTY_TYPE}.
   * @returns {Boolean} - Failes if the property does not exist.
   */
  createProperty: function(name, type, initialValue, options) {
    // Make sure this property doesn't already exist.
    for (var i = 0; i < this._properties.length; ++i) {
      if (this._properties[i].name === name) {
        return false;
      }
    }

    // Make sure the type is valid.
    if (!wcPlay.PROPERTY_TYPE.hasOwnProperty(type)) {
      type = wcPlay.PROPERTY_TYPE.STRING;
    }

    this._properties.push({
      name: name,
      value: initialValue,
      initialValue: initialValue,
      type: type,
      options: options || {},
    });
    return true;
  },

  /**
   * Renames an existing global property.
   * @function wcPlay#renameProperty
   * @param {String} name - The current name of the global property to rename.
   * @param {String} newName - The new desired name of the global property.
   * @returns {Boolean} - Fails if the property was not found or if the new name is already used.
   */
  renameProperty: function(name, newName) {
    var prop = null;
    for (var i = 0; i < this._properties.length; ++i) {
      if (this._properties[i].name === newName) {
        return false;
      }

      if (this._properties[i].name === name) {
        prop = this._properties[i];
      }
    }

    if (!prop) {
      return false;
    }

    prop.name = newName;
    this.__notifyNodes('onSharedPropertyRenamed', [name, newName]);
  },

  /**
   * Gets, or Sets a global property value.
   * @function wcPlay#property
   * @param {String} name - The name of the property.
   * @param {Object} [value] - If supplied, will assign a new value to the property.
   * @returns {Object} - The current value of the property, or undefined if not found.
   */
  property: function(name, value) {
    var prop = null;
    for (var i = 0; i < this._properties.length; ++i) {
      if (this._properties[i].name === name) {
        prop = this._properties[i];
        break;
      }
    }

    if (!prop) {
      return;
    }

    if (value !== undefined && value !== prop.value) {
      var oldValue = prop.value;
      prop.value = value;
      this.__notifyNodes('onSharedPropertyChanged', [prop.name, oldValue, prop.value]);
    }
  },

  /**
   * Gets, or Sets a global property initial value.
   * @function wcPlay#initialProperty
   * @param {String} name - The name of the property.
   * @param {Object} [value] - If supplied, will assign a new value to the property.
   * @returns {Object} - The current value of the property, or undefined if not found.
   */
  initialProperty: function(name, value) {
    var prop = null;
    for (var i = 0; i < this._properties.length; ++i) {
      if (this._properties[i].name === name) {
        prop = this._properties[i];
        break;
      }
    }

    if (!prop) {
      return;
    }

    if (value !== undefined && value !== prop.initialValue) {
      var oldValue = prop.initialValue;
      prop.initialValue = value;

      if (prop.value === oldValue) {
        prop.value = value;
        this.__notifyNodes('onSharedPropertyChanged', [prop.name, oldValue, prop.value]);
      }
    }
  },

  /**
   * Triggers an event into the Play script.
   * @function wcPlay#triggerEvent
   * @param {String} name - The event name to trigger (more specifically, the name of the wcNodeEntry).
   * @param {Object} data - Any data object that will be passed into the entry node.
   */
  triggerEvent: function(name, data) {
    for (var i = 0; i < this._entryNodes.length; ++i) {
      if (this._entryNodes[i].name === name) {
        this._entryNodes[i].onTriggered(data);
      }
    }
  },

  /**
   * Queues a node entry link to trigger on the next update.
   * @function wcPlay#queueNodeEntry
   * @param {wcNode} node - The node being queued.
   * @param {String} name - The entry link name.
   */
  queueNodeEntry: function(node, name) {
    if (node.enabled()) {
      this._queuedChain.push({
        node: node,
        name: name,
      });

      if (node.debugBreak() || this._isStepping) {
        node._meta.flash = true;
        node._meta.paused = true;
        this._isPaused = true;
      }
    }
  },

  /**
   * Queues a node property value change to trigger on the next update.
   * @function wcPlay#queueNodeProperty
   * @param {wcNode} node - The node being queued.
   * @param {String} name - The property name.
   * @param {Object} value - The property value.
   */
  queueNodeProperty: function(node, name, value) {
    if (node.enabled()) {
      this._queuedProperties.push({
        node: node,
        name: name,
        value: value,
      });

      if (node.debugBreak() || this._isStepping) {
        node._meta.flash = true;
        node._meta.paused = true;
        this._isPaused = true;
      }
    }
  },

  /**
   * Adds a node into the known node stacks.
   * @function wcPlay#__addNode
   * @private
   * @param {wcNode} node - The node to add.
   */
  __addNode: function(node) {
    if (node instanceof wcNodeEntry) {
      this._entryNodes.push(node);
    } else if (node instanceof wcNodeProcess) {
      this._processNodes.push(node);
    } else if (node instanceof wcNodeStorage) {
      this._storageNodes.push(node);
    } else if (node instanceof wcNodeComposite) {
      this._compositeNodes.push(node);
    }
  },

  /**
   * Removes a node from the known node stacks.
   * @function wcPlay#__removeNode
   * @private
   * @param {wcNode} node - The node to remove.
   */
  __removeNode: function(node) {
    if (node instanceof wcNodeEntry) {
      this._entryNodes.splice(this._entryNodes.indexOf(node), 1);
    } else if (node instanceof wcNodeProcess) {
      this._processNodes.splice(this._processNodes.indexOf(node), 1);
    } else if (node instanceof wcNodeStorage) {
      this._storageNodes.splice(this._storageNodes.indexOf(node), 1);
    } else if (node instanceof wcNodeComposite) {
      this._compositeNodes.splice(this._compositeNodes.indexOf(node), 1);
    }
  },

  /**
   * Sends a custom notification event to all nodes.
   * @function wcPlay#__notifyNodes
   * @private
   * @param {String} func - The node function to call.
   * @param {Object[]} args - A list of arguments to forward into the function call.
   */
  __notifyNodes: function(func, args) {
    var self;
    for (var i = 0; i < this._storageNodes.length; ++i) {
      self = this._storageNodes[i];
      if (typeof self[func] === 'function') {
        self[func].apply(self, args);
      }
    }
    for (var i = 0; i < this._processNodes.length; ++i) {
      self = this._processNodes[i];
      if (typeof self[func] === 'function') {
        self[func].apply(self, args);
      }
    }
    for (var i = 0; i < this._compositeNodes.length; ++i) {
      self = this._compositeNodes[i];
      if (typeof self[func] === 'function') {
        self[func].apply(self, args);
      }
    }
    for (var i = 0; i < this._entryNodes.length; ++i) {
      self = this._entryNodes[i];
      if (typeof self[func] === 'function') {
        self[func].apply(self, args);
      }
    }
  },

  /**
   * Sends a custom notification event to all renderers.
   * @function wcPlay#__notifyEditors
   * @private
   * @param {String} func - The renderer function to call.
   * @param {Object[]} args - A list of arguments to forward into the function call.
   */
  __notifyEditors: function(func, args) {
    var self;
    for (var i = 0; i < this._editors.length; ++i) {
      self = this._editors[i];
      if (typeof self[func] === 'function') {
        self[func].apply(self, args);
      }
    }
  },
};
/**
 * @class
 * Provides a visual interface for editing a Play script. Requires HTML5 canvas.
 *
 * @constructor
 * @param {external:jQuery~Object|external:jQuery~Selector|external:domNode} container - The container element.
 * @param {wcPlayEditor~Options} [options] - Custom options.
 */
function wcPlayEditor(container, options) {
  this.$container = $(container);
  this.$viewport = null;
  this._viewportContext = null;
  this.$palette = null;
  this._paletteSize = 0.25;
  this.$typeButton = [];
  this.$typeArea = [];

  this._size = {x: 0, y: 0};

  this._engine = null;
  this._nodeLibrary = {};

  this._font = {
    title: {size: 15, family: 'Arial', weight: 'bold'},
    links: {size: 10, family: 'Arial'},
    property: {size: 10, family: 'Arial', weight: 'italic'},
    value: {size: 10, family: 'Arial', weight: 'bold'},
    initialValue: {size: 10, family: 'Arial', weight: 'bold italic'},
  };

  this._drawStyle = {
    palette: {
      spacing: 20,        // Spacing between nodes in the palette view.
    },
    node: {
      radius: 10,         // The radius to draw node corners.
      margin: 15,         // The pixel space between the property text and the edge of the node border.
    },
    title: {
      spacing: 5,         // The pixel space between the title text and the bar that separates the properties.
    },
    links: {
      length: 12,         // Length of each link 'nub'
      width: 8,           // Width of each link 'nub'
      spacing: 10,        // The pixel space between the text of adjacent links.
      padding: 5,         // The pixel space between the link and its text.
      margin: 10,         // The pixel space between the link text and the edge of the node border.
    },
    property: {
      spacing: 5,         // The pixel space between adjacent properties.
      strLen: 10,         // The maximum character length a property value can display.
      valueWrapL: '',    // The left string to wrap around a property value.
      valueWrapR: '  ',    // The right string to wrap around a property value.
      initialWrapL: '(',  // The left string to wrap around a property initial value.
      initialWrapR: ')',  // The right string to wrap around a property initial value.
    },
  };

  // Update properties.
  this._lastUpdate = 0;

  // Control properties.
  this._viewportCamera = {x: 0, y: 0, z: 1};
  this._viewportMovingNode = false;
  this._viewportMoving = false;
  this._viewportMoved = false;
  this._paletteMoving = false;

  this._mouse = {x: 0, y: 0};
  this._highlightRect = null;
  this._highlightNode = null;
  this._selectedNode = null;
  this._selectedNodes = [];
  this._expandedNode = null;
  this._expandedNodeWasCollapsed = false;

  this._highlightCollapser = false;
  this._highlightBreakpoint = false;
  this._highlightEntryLink = false;
  this._highlightExitLink = false;
  this._highlightInputLink = false;
  this._highlightOutputLink = false;
  this._highlightPropertyValue = false;
  this._highlightPropertyInitialValue = false;

  this._selectedEntryLink = false;
  this._selectedExitLink = false;
  this._selectedInputLink = false;
  this._selectedOutputLink = false;
  this._selectedNodeOrigins = [];

  this._draggingNodeData = null;

  // Undo management is optional.
  this._undoManager = null;

  // Setup our options.
  this._options = {
    readOnly: false,
  };
  for (var prop in options) {
    this._options[prop] = options[prop];
  }

  this.$top = $('<div class="wcPlayEditorTop">');
  this.$main = $('<div class="wcPlayEditorMain">');
  this.$palette = $('<div class="wcPlayPalette wcPlayNoHighlights">');
  this.$paletteInner = $('<div class="wcPlayPaletteInner">');
  this.$viewport = $('<canvas class="wcPlayViewport">');
  this._viewportContext = this.$viewport[0].getContext('2d');

  this.$palette.append(this.$paletteInner);

  this.$main.append(this.$palette);
  this.$main.append(this.$viewport);
  this.$container.append(this.$top);
  this.$container.append(this.$main);

  this.onResized();

  this.__setupMenu();
  this.__setupPalette();
  this.__setupControls();

  window.requestAnimationFrame(this.__update.bind(this));
}

wcPlayEditor.prototype = {
  /**
   * Gets, or Sets the {@link wcPlay} engine that this renderer will render.
   * @function wcPlayEditor#engine
   * @param {wcPlay} [engine] - If supplied, will assign a new {@link wcPlay} engine to render.
   * @returns {wcPlay} - The current {@link wcPlay} engine.
   */
  engine: function(engine) {
    if (engine !== undefined && engine !== this._engine) {
      if (this._engine) {
        var index = this._engine._editors.indexOf(this);
        if (index > -1) {
          this._engine._editors.splice(index, 1);
        }
        this._engine._undoManager = this._undoManager;
        this._undoManager = null;
      }

      this._engine = engine;

      if (this._engine) {
        this._engine._editors.push(this);
        this._undoManager = this._engine._undoManager;
        if (!this._undoManager && window.wcUndoManager) {
          this._undoManager = new wcUndoManager();
          this._engine._undoManager = this._undoManager;
        }
      }
    }

    return this._engine;
  },

  /**
   * Positions the canvas view to the center of all nodes.
   * @function wcPlayEditor#center
   */
  center: function() {
    // TODO:
  },

  /**
   * Event that is called when the container view is resized.
   * @function wcPlayEditor#onResized
   */
  onResized: function() {
    var width = this.$main.width();
    var height= this.$main.height();

    if (this._size.x !== width || this._size.y !== height) {
      this._size.x = width;
      this._size.y = height;

      var w = width * this._paletteSize;
      this.$palette.css('width', w).attr('width', w).attr('height', height);
      this.$viewport.css('width', width - w).attr('width', width - w).attr('height', height);
    }
  },

  /**
   * Retrieve mouse or touch position.
   * @function wcPlayEditor#__mouse
   * @private
   * @param {Object} event - The mouse event.
   * @param {wcPlayEditor~Offset} [offset] - An optional screen offset to apply to the pos.
   * @param {wcPlay~Coordinates} [translation] - An optional camera translation to apply to the pos.
   * @return {wcPlay~Coordinates} - The mouse position.
   */
  __mouse: function(event, offset, translation) {
    if (event.originalEvent && (event.originalEvent.touches || event.originalEvent.changedTouches)) {
      var touch = event.originalEvent.touches[0] || event.originalEvent.changedTouches[0];
      return {
        x: touch.clientX - (offset? offset.left: 0) - (translation? translation.x: 0),
        y: touch.clientY - (offset? offset.top: 0) - (translation? translation.y: 0),
        gx: touch.clientX,
        gy: touch.clientY,
        which: 1,
      };
    }

    return {
      x: (event.clientX || event.pageX) - (offset? offset.left: 0) - (translation? translation.x: 0),
      y: (event.clientY || event.pageY) - (offset? offset.top: 0) - (translation? translation.y: 0),
      gx: (event.clientX || event.pageX),
      gy: (event.clientY || event.pageY),
      which: event.which || 1,
    };
  },

  /**
   * Assigns font data to the canvas.
   * @function wcPlayEditor#__setCanvasFont
   * @private
   * @param {Object} font - The font data to assign (wcPlayEditor~_font object).
   * @param {external:Canvas~Context} context - The canvas context.
   */
  __setCanvasFont: function(font, context) {
    context.font = (font.weight? font.weight + ' ': '') + (font.size + 'px ') + font.family;
  },

  /**
   * Clamps a given string value to a specific number of characters and appends a '...' if necessary.
   * @function wcPlayEditor#__clampString
   * @private
   * @param {String} str - The string to clamp.
   * @param {Number} len - The number of characters to allow.
   * @returns {String} - A clamped string.
   */
  __clampString: function(str, len) {
    if (str.length > len) {
      return str.substring(0, len) + '...';
    }
    return str;
  },

  /**
   * Blends two colors together. Color strings can be in hex string {'#ffffff'} or rgb string {'rgb(250,250,250)'} formats.
   * @function wcPlayEditor#__blendColors
   * @private
   * @param {String} c0 - The first color string.
   * @param {String} c1 - The second color string.
   * @param {Number} p - a multiplier to blend the colors by.
   */
  __blendColors: function(c0, c1, p) {
      var n=p<0?p*-1:p,u=Math.round,w=parseInt;
      if(c0.length>7){
          var f=c0.split(","),t=(c1?c1:p<0?"rgb(0,0,0)":"rgb(255,255,255)").split(","),R=w(f[0].slice(4)),G=w(f[1]),B=w(f[2]);
          return "rgb("+(u((w(t[0].slice(4))-R)*n)+R)+","+(u((w(t[1])-G)*n)+G)+","+(u((w(t[2])-B)*n)+B)+")"
      }else{
          var f=w(c0.slice(1),16),t=w((c1?c1:p<0?"#000000":"#FFFFFF").slice(1),16),R1=f>>16,G1=f>>8&0x00FF,B1=f&0x0000FF;
          return "#"+(0x1000000+(u(((t>>16)-R1)*n)+R1)*0x10000+(u(((t>>8&0x00FF)-G1)*n)+G1)*0x100+(u(((t&0x0000FF)-B1)*n)+B1)).toString(16).slice(1)
      }
  },

  /**
   * Retrieves a bounding rectangle that encloses all given rectangles.
   * @function wcPlayEditor#__expandRect
   * @private
   * @param {wcPlayEditor~Rect[]} rects - A list of rectangles to expand from.
   * @param {wcPlayEditor~Rect} - A bounding rectangle that encloses all given rectangles.
   */
  __expandRect: function(rects) {
    var bounds = {
      top: rects[0].top,
      left: rects[0].left,
      width: rects[0].width,
      height: rects[0].height,
    };

    for (var i = 1; i < rects.length; ++i) {
      if (rects[i].top < bounds.top) {
        bounds.top = rects[i].top;
      }
      if (rects[i].left < bounds.left) {
        bounds.left = rects[i].left;
      }
      if (rects[i].top + rects[i].height > bounds.top + bounds.height) {
        bounds.height = (rects[i].top + rects[i].height) - bounds.top;
      }
      if (rects[i].left + rects[i].width > bounds.left + bounds.width) {
        bounds.width = (rects[i].left + rects[i].width) - bounds.left;
      }
    }

    return bounds;
  },

  /**
   * Tests whether a given point is within a bounding rectangle.
   * @function wcPlayEditor#__inRect
   * @private
   * @param {wcPlay~Coordinates} pos - The position to test.
   * @param {wcPlayEditor~Rect} rect - The bounding rectangle.
   * @param {wcPlay~Coordinates} [trans] - An optional camera translation to apply to the pos.
   * @returns {Boolean} - Whether there is a collision.
   */
  __inRect: function(pos, rect, trans) {
    if (trans === undefined) {
      trans = {
        x: 0,
        y: 0,
        z: 1,
      };
    }

    if ((pos.y - trans.y) / trans.z >= rect.top &&
        (pos.x - trans.x) / trans.z >= rect.left &&
        (pos.y - trans.y) / trans.z <= rect.top + rect.height &&
        (pos.x - trans.x) / trans.z <= rect.left + rect.width) {
      return true;
    }
    return false;
  },

  /**
   * Tests whether a given rectangle is within a bounding rectangle.
   * @function wcPlayEditor#__rectInRect
   * @private
   * @param {wcPlayEditor~Rect} rectA - The first rectangle.
   * @param {wcPlayEditor~Rect} rectB - The second rectangle.
   * @returns {Boolean} - Whether there is a collision.
   */
  __rectInRect: function(rectA, rectB) {
    return !(rectB.left > rectA.left + rectA.width ||
            rectB.left + rectB.width < rectA.left ||
            rectB.top > rectA.top + rectA.height ||
            rectB.top + rectB.height < rectA.top);
  },

  /**
   * Draws a bounding rectangle.
   * @function wcPlayEditor#__drawRect
   * @private
   * @param {wcPlayEditor~Rect} rect - The rectangle bounds to draw.
   * @param {String} color - The color to draw.
   * @param {external:Canvas~Context} context - The canvas context to render on.
   */
  __drawRect: function(rect, color, context) {
    context.strokeStyle = color;
    context.strokeRect(rect.left, rect.top, rect.width, rect.height);
  },

  __drawRoundedRect: function(rect, color, lineWidth, radius, context) {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(rect.left + radius, rect.top);
    context.arcTo(rect.left + rect.width, rect.top, rect.left + rect.width, rect.top + radius, radius);
    context.arcTo(rect.left + rect.width, rect.top + rect.height, rect.left + rect.width - radius, rect.top + rect.height, radius);
    context.arcTo(rect.left, rect.top + rect.height, rect.left, rect.top + rect.height - radius, radius);
    context.arcTo(rect.left, rect.top, rect.left + radius, rect.top, radius);
    context.closePath();
    context.stroke();
    context.restore();
  },

  /**
   * Renders a new frame.
   * @function wcPlayEditor#__update
   * @private
   */
  __update: function(timestamp) {
    if (!this._lastUpdate) {
      this._lastUpdate = timestamp;
    }
    var elapsed = (timestamp - this._lastUpdate) / 1000;
    this._lastUpdate = timestamp;

    // Update undo/redo menu.
    var self = this;
    $('.wcPlayEditorMenuOptionUndo').each(function() {
      $(this).toggleClass('disabled', !self._undoManager.canUndo()).find('.wcButton').toggleClass('disabled', !self._undoManager.canUndo());
      $(this).attr('title', 'Undo ' + self._undoManager.undoInfo());
    });
    $('.wcPlayEditorMenuOptionRedo').each(function() {
      $(this).toggleClass('disabled', !self._undoManager.canRedo()).find('.wcButton').toggleClass('disabled', !self._undoManager.canRedo());
      $(this).attr('title', 'Redo ' + self._undoManager.redoInfo());
    });
    $('.wcPlayEditorMenuOptionDebugging').children('i:first-child, span:first-child').toggleClass('fa-dot-circle-o', this._engine.debugging()).toggleClass('fa-circle-o', !this._engine.debugging()).toggleClass('wcToggled', this._engine.debugging());
    $('.wcPlayEditorMenuOptionSilence').children('i:first-child, span:first-child').toggleClass('fa-volume-off', this._engine.silent()).toggleClass('fa-volume-up', !this._engine.silent()).toggleClass('wcToggled', this._engine.silent());
    $('.wcPlayEditorMenuOptionPausePlay').children('i:first-child, span:first-child').toggleClass('fa-play', this._engine.paused()).toggleClass('fa-pause', !this._engine.paused());
    $('.wcPlayEditorMenuOptionDelete').toggleClass('disabled', this._selectedNodes.length === 0);


    this.onResized();

    if (this._engine) {

      // Render the palette.
      this.__drawPalette(elapsed);

      // Setup viewport canvas.
      this._viewportContext.clearRect(0, 0, this.$viewport.width(), this.$viewport.height());

      this._viewportContext.save();
      this._viewportContext.translate(this._viewportCamera.x, this._viewportCamera.y);
      this._viewportContext.scale(this._viewportCamera.z, this._viewportCamera.z);
      // this._viewportContext.translate(this._viewportCamera.x / this._viewportCamera.z, this._viewportCamera.y / this._viewportCamera.z);

      // Update nodes.
      this.__updateNodes(this._engine._entryNodes, elapsed);
      this.__updateNodes(this._engine._processNodes, elapsed);
      this.__updateNodes(this._engine._compositeNodes, elapsed);
      this.__updateNodes(this._engine._storageNodes, elapsed);

      // Render the nodes in the main script.
      this.__drawNodes(this._engine._entryNodes, this._viewportContext);
      this.__drawNodes(this._engine._processNodes, this._viewportContext);
      this.__drawNodes(this._engine._compositeNodes, this._viewportContext);
      this.__drawNodes(this._engine._storageNodes, this._viewportContext);

      // Render chains between nodes.
      this.__drawChains(this._engine._entryNodes, this._viewportContext);
      this.__drawChains(this._engine._processNodes, this._viewportContext);
      this.__drawChains(this._engine._compositeNodes, this._viewportContext);
      this.__drawChains(this._engine._storageNodes, this._viewportContext);

      if (this._highlightRect) {
        this._viewportContext.strokeStyle = 'cyan';
        this._viewportContext.strokeRect(this._highlightRect.left, this._highlightRect.top, this._highlightRect.width, this._highlightRect.height);
      }
      this._viewportContext.restore();
    }

    window.requestAnimationFrame(this.__update.bind(this));
  },

  /**
   * Updates the status of a list of nodes.
   * @function wcPlayEditor#__updateNodes
   * @private
   * @param {wcNode[]} nodes - The nodes to update.
   * @param {Number} elapsed - Elapsed time since last update.
   */
  __updateNodes: function(nodes, elapsed) {
    for (var i = 0; i < nodes.length; ++i) {
      this.__updateNode(nodes[i], elapsed);
    }
  },

  /**
   * Updates the status of a node.
   * @function wcPlayEditor#__updateNode
   * @private
   * @param {wcNode} node - The Node to update.
   * @param {Number} elapsed - Elapsed time since last update.
   */
  __updateNode: function(node, elapsed) {
    // Update flash state.
    var self = this;
    function __updateFlash(meta, darkColor, lightColor, pauseColor, keepPaused, colorMul) {
      if (meta.flash) {
        meta.flashDelta += elapsed * 10.0;
        if (meta.flashDelta >= 1.0) {
          meta.flashDelta = 1.0;

          if (!meta.awake && (!meta.paused || (!keepPaused && !self._engine.paused()))) {
            meta.flash = false;
          }
        }
      } else if (meta.flashDelta > 0.0) {
        meta.flashDelta -= elapsed * 5.0;
        if (meta.flashDelta <= 0.0) {
          meta.flashDelta = 0;
          meta.paused = keepPaused? meta.paused: false;
        }
      }

      meta.color = self.__blendColors(darkColor, meta.paused? pauseColor: lightColor, meta.flashDelta * colorMul);
    }

    var color = node.color;
    if (this._highlightNode === node) {
      color = this.__blendColors(node.color, "#00FFFF", 0.5);
    }
    __updateFlash(node._meta, color, "#FFFFFF", "#FFFFFF", true, 0.5);

    var blackColor = "#000000";
    var propColor  = "#117711";
    var flashColor = "#FFFF00";
    for (var i = 0; i < node.chain.entry.length; ++i) {
      __updateFlash(node.chain.entry[i].meta, blackColor, flashColor, flashColor, false, 0.9);
    }
    for (var i = 0; i < node.chain.exit.length; ++i) {
      __updateFlash(node.chain.exit[i].meta, blackColor, flashColor, flashColor, false, 0.9);
    }
    for (var i = 0; i < node.properties.length; ++i) {
      __updateFlash(node.properties[i].inputMeta, propColor, flashColor, flashColor, false, 0.9);
      __updateFlash(node.properties[i].outputMeta, propColor, flashColor, flashColor, false, 0.9);
    }
  },

  /**
   * Retrieves the index for a node type.
   * @function wcPlayEditor#__typeIndex
   * @private
   * @param {wcPlay.NODE_TYPE} type - The node type.
   * @returns {Number} - The type index.
   */
  __typeIndex: function(type) {
    switch (type) {
      case wcPlay.NODE_TYPE.ENTRY: return 0;
      case wcPlay.NODE_TYPE.PROCESS: return 1;
      case wcPlay.NODE_TYPE.STORAGE: return 2;
    }
  },

  /**
   * Initializes the file menu and toolbar.
   * @function wcPlayEditor#__setupMenu
   * @private
   */
  __setupMenu: function() {
    var $fileMenu = $('\
      <ul class="wcPlayEditorMenu wcPlayNoHighlights">\
        <span class="wcPlayVersionTag wcPlayNoHighlights"></span>\
        <li><span>File</span>\
          <ul>\
            <li><span class="wcPlayEditorMenuOptionNew wcPlayMenuItem"><i class="wcPlayEditorMenuIcon wcButton fa fa-file-o fa-lg"/>New Script...<span>Ctrl+N</span></span></li>\
            <li><span class="wcPlayEditorMenuOptionOpen wcPlayMenuItem disabled"><i class="wcPlayEditorMenuIcon wcButton fa fa-folder-open-o fa-lg"/>Open Script...<span>Ctrl+O</span></span></li>\
            <li><span class="wcPlayEditorMenuOptionSave wcPlayMenuItem disabled"><i class="wcPlayEditorMenuIcon wcButton fa fa-save fa-lg"/>Save Script<span>Ctrl+S</span></span></li>\
          </ul>\
        </li>\
        <li><span>Edit</span>\
          <ul>\
            <li><span class="wcPlayEditorMenuOptionUndo wcPlayMenuItem disabled"><i class="wcPlayEditorMenuIcon wcButton fa fa-backward fa-lg"/>Undo<span>Ctrl+Z</span></span></li>\
            <li><span class="wcPlayEditorMenuOptionRedo wcPlayMenuItem disabled"><i class="wcPlayEditorMenuIcon wcButton fa fa-forward fa-lg"/>Redo<span>Ctrl+Y</span></span></li>\
            <li><hr class="wcPlayMenuSeparator"></li>\
            <li><span class="wcPlayEditorMenuOptionCut wcPlayMenuItem disabled"><i class="wcPlayEditorMenuIcon wcButton fa fa-cut fa-lg"/>Cut<span>Ctrl+X</span></span></li>\
            <li><span class="wcPlayEditorMenuOptionCopy wcPlayMenuItem disabled"><i class="wcPlayEditorMenuIcon wcButton fa fa-copy fa-lg"/>Copy<span>Ctrl+C</span></span></li>\
            <li><span class="wcPlayEditorMenuOptionPaste wcPlayMenuItem disabled"><i class="wcPlayEditorMenuIcon wcButton fa fa-paste fa-lg"/>Paste<span>Ctrl+P</span></span></li>\
            <li><span class="wcPlayEditorMenuOptionDelete wcPlayMenuItem"><i class="wcPlayEditorMenuIcon wcButton fa fa-trash-o fa-lg"/>Delete<span>Del</span></span></li>\
          </ul>\
        </li>\
        <li><span>Debugging</span>\
          <ul>\
            <li><span class="wcPlayEditorMenuOptionDebugging wcPlayMenuItem" title="Toggle debugging mode for the entire script."><i class="wcPlayEditorMenuIcon wcButton fa fa-dot-circle-o fa-lg"/>Toggle Debugger<span></span></span></li>\
            <li><span class="wcPlayEditorMenuOptionSilence wcPlayMenuItem" title="Toggle silent mode for the entire script (Nodes with debug log enabled will not log when this is active)."><i class="wcPlayEditorMenuIcon wcButton fa fa-volume-up fa-lg"/>Toggle Debugger<span></span></span></li>\
            <li><hr class="wcPlayMenuSeparator"></li>\
            <li><span class="wcPlayEditorMenuOptionRestart wcPlayMenuItem" title="Reset all property values to their initial state and restart the execution of the script."><i class="wcPlayEditorMenuIcon wcButton fa fa-refresh fa-lg"/>Restart Script<span></span></span></li>\
            <li><span class="wcPlayEditorMenuOptionPausePlay wcPlayMenuItem" title="Pause or Continue execution of the script."><i class="wcPlayEditorMenuIcon wcButton fa fa-pause fa-lg"/>Pause/Continue Script<span>Return</span></span></li>\
            <li><span class="wcPlayEditorMenuOptionStep wcPlayMenuItem" title="Steps execution of the script by a single update."><i class="wcPlayEditorMenuIcon wcButton fa fa-forward fa-lg"/>Step Script<span>Spacebar</span></span></li>\
          </ul>\
        </li>\
        <li><span>Help</span>\
          <ul>\
            <li><span class="wcPlayEditorMenuOptionDocs wcPlayMenuItem" title="Open the documentation for wcPlay in another window."><i class="wcPlayEditorMenuIcon wcButton fa fa-file-pdf-o fa-lg"/>Documentation...<span></span></span></li>\
            <li><span class="wcPlayEditorMenuOptionAbout wcPlayMenuItem disabled"><i class="wcPlayEditorMenuIcon wcButton fa fa-question fa-lg"/>About...<span></span></span></li>\
          </ul>\
        </li>\
      </ul>\
    ');

    var $toolbar = $('\
      <div class="wcPlayEditorToolbar wcPlayNoHighlights">\
        <div class="wcPlayEditorMenuOptionNew"><span class="wcPlayEditorMenuIcon wcButton fa fa-file-o fa-lg" title="New Project"/></div>\
        <div class="wcPlayEditorMenuOptionOpen disabled"><span class="wcPlayEditorMenuIcon wcButton fa fa-folder-open-o fa-lg" title="Open Project"></div>\
        <div class="wcPlayEditorMenuOptionSave disabled"><span class="wcPlayEditorMenuIcon wcButton fa fa-save fa-lg" title="Save Project"></div>\
        <div class="ARPG_Separator"></div>\
        <div class="wcPlayEditorMenuOptionUndo"><span class="wcPlayEditorMenuIcon wcButton fa fa-backward fa-lg"/></div>\
        <div class="wcPlayEditorMenuOptionRedo"><span class="wcPlayEditorMenuIcon wcButton fa fa-forward fa-lg"/></div>\
        <div class="ARPG_Separator"></div>\
        <div class="wcPlayEditorMenuOptionCut disabled"><span class="wcPlayEditorMenuIcon wcButton fa fa-cut fa-lg" title="Cut"/></div>\
        <div class="wcPlayEditorMenuOptionCopy disabled"><span class="wcPlayEditorMenuIcon wcButton fa fa-copy fa-lg" title="Copy"/></div>\
        <div class="wcPlayEditorMenuOptionPaste disabled"><span class="wcPlayEditorMenuIcon wcButton fa fa-paste fa-lg" title="Paste"/></div>\
        <div class="wcPlayEditorMenuOptionDelete"><span class="wcPlayEditorMenuIcon wcButton fa fa-trash-o fa-lg" title="Delete"/></div>\
        <div class="ARPG_Separator"></div>\
        <div class="wcPlayEditorMenuOptionDebugging"><span class="wcPlayEditorMenuIcon wcButton fa fa-dot-circle-o fa-lg" title="Toggle debugging mode for the entire script."/></div>\
        <div class="wcPlayEditorMenuOptionSilence"><span class="wcPlayEditorMenuIcon wcButton fa fa-volume-up fa-lg" title="Toggle silent mode for the entire script (Nodes with debug log enabled will not log when this is active)."/></div>\
        <div class="ARPG_Separator"></div>\
        <div class="wcPlayEditorMenuOptionRestart"><span class="wcPlayEditorMenuIcon wcButton fa fa-refresh fa-lg" title="Reset all property values to their initial state and restart the execution of the script."/></div>\
        <div class="wcPlayEditorMenuOptionPausePlay"><span class="wcPlayEditorMenuIcon wcButton fa fa-pause fa-lg" title="Pause or Continue execution of the script."/></div>\
        <div class="wcPlayEditorMenuOptionStep"><span class="wcPlayEditorMenuIcon wcButton fa fa-forward fa-lg" title="Steps execution of the script by a single update."/></div>\
        <div class="ARPG_Separator"></div>\
        <div class="wcPlayEditorMenuOptionDocs"><span class="wcPlayEditorMenuIcon wcButton fa fa-file-pdf-o fa-lg" title="Open the documentation for wcPlay in another window."/></div>\
        <div class="wcPlayEditorMenuOptionAbout disabled"><span class="wcPlayEditorMenuIcon wcButton fa fa-question fa-lg"/></div>\
      </div>\
    ');

    this.$top.append($fileMenu);
    this.$top.append($toolbar);
  },

  /**
   * Initializes the palette view.
   * @function wcPlayEditor#__setupPalette
   * @private
   */
  __setupPalette: function() {
    // Create our top bar with buttons for each node type.
    this.$typeButton.push($('<button class="wcPlayEditorButton wcToggled" title="Show Entry Nodes.">Entry</button>'));
    this.$typeButton.push($('<button class="wcPlayEditorButton" title="Show Process Nodes.">Process</button>'));
    this.$typeButton.push($('<button class="wcPlayEditorButton" title="Show Storage Nodes.">Storage</button>'));
    this.$palette.append(this.$typeButton[0]);
    this.$palette.append(this.$typeButton[1]);
    this.$palette.append(this.$typeButton[2]);

    this.$typeArea.push($('<div class="wcPlayTypeArea">'));
    this.$typeArea.push($('<div class="wcPlayTypeArea wcPlayHidden">'));
    this.$typeArea.push($('<div class="wcPlayTypeArea wcPlayHidden">'));
    this.$paletteInner.append(this.$typeArea[0]);
    this.$paletteInner.append(this.$typeArea[1]);
    this.$paletteInner.append(this.$typeArea[2]);

    // Initialize our node library.
    for (var i = 0; i < wcPlay.NODE_LIBRARY.length; ++i) {
      var data = wcPlay.NODE_LIBRARY[i];

      // Initialize the node category if it is new.
      if (!this._nodeLibrary.hasOwnProperty(data.category)) {
        this._nodeLibrary[data.category] = {};
      }

      // Further categorize the node by its type.
      if (!this._nodeLibrary[data.category].hasOwnProperty(data.type)) {
        var typeData = {
          $category: $('<div class="wcPlayTypeCategory">'),
          $button: $('<button class="wcPlayCategoryButton wcToggled" title="Toggle visibility of this category.">' + data.category + '</button>'),
          $canvas: $('<canvas class="wcPlayTypeCategoryArea">'),
          context: null,
          nodes: [],
        };
        typeData.context = typeData.$canvas[0].getContext('2d');
        typeData.$category.append(typeData.$button);
        typeData.$category.append(typeData.$canvas);
        this.$typeArea[this.__typeIndex(data.type)].append(typeData.$category);

        (function __setupCollapseHandler(d) {
          d.$button.click(function() {
            if (d.$button.hasClass('wcToggled')) {
              d.$button.removeClass('wcToggled');
              d.$canvas.addClass('wcPlayHidden');
            } else {
              d.$button.addClass('wcToggled');
              d.$canvas.removeClass('wcPlayHidden');
            }
          });
        })(typeData);

        this._nodeLibrary[data.category][data.type] = typeData;
      }

      // Now create an instance of the node.
      var node = new window[data.name](null);
      this._nodeLibrary[data.category][data.type].nodes.push(node);
      this.__updateNode(node, 0);
    }

    // Now draw each of our palette nodes once so we can configure the size of the canvases.
    for (var cat in this._nodeLibrary) {
      for (var type in this._nodeLibrary[cat]) {
        var typeData = this._nodeLibrary[cat][type];
        typeData.$canvas.attr('width', this.$paletteInner.width());
        var yPos = this._drawStyle.palette.spacing;
        var xPos = this.$paletteInner.width() / 2;
        for (var i = 0; i < typeData.nodes.length; ++i) {
          var drawData = this.__drawNode(typeData.nodes[i], {x: xPos, y: yPos}, typeData.context, true);
          yPos += drawData.rect.height + this._drawStyle.palette.spacing;
        }
        typeData.$canvas.attr('height', yPos);
      }
    }

    var self = this;
    this.$typeButton[0].click(function() {
      self.$typeButton[0].addClass('wcToggled');
      self.$typeButton[1].removeClass('wcToggled');
      self.$typeButton[2].removeClass('wcToggled');

      self.$typeArea[0].removeClass('wcPlayHidden');
      self.$typeArea[1].addClass('wcPlayHidden');
      self.$typeArea[2].addClass('wcPlayHidden');
    });
    this.$typeButton[1].click(function() {
      self.$typeButton[0].removeClass('wcToggled');
      self.$typeButton[1].addClass('wcToggled');
      self.$typeButton[2].removeClass('wcToggled');

      self.$typeArea[0].addClass('wcPlayHidden');
      self.$typeArea[1].removeClass('wcPlayHidden');
      self.$typeArea[2].addClass('wcPlayHidden');
    });
    this.$typeButton[2].click(function() {
      self.$typeButton[0].removeClass('wcToggled');
      self.$typeButton[1].removeClass('wcToggled');
      self.$typeButton[2].addClass('wcToggled');

      self.$typeArea[0].addClass('wcPlayHidden');
      self.$typeArea[1].addClass('wcPlayHidden');
      self.$typeArea[2].removeClass('wcPlayHidden');
    });
  },

  /**
   * Draws each node in the palette view.
   * @function wcPlayEditor#__drawPalette
   * @private
   * @param {Number} elapsed - Elapsed time since last update.
   */
  __drawPalette: function(elapsed) {
    for (var cat in this._nodeLibrary) {
      for (var type in this._nodeLibrary[cat]) {

        // Ignore types that are not visible.
        if (!this.$typeButton[this.__typeIndex(type)].hasClass('wcToggled')) continue;

        var typeData = this._nodeLibrary[cat][type];

        // Ignore categories that are not visible.
        if (!typeData.$button.hasClass('wcToggled')) continue;

        var yPos = this._drawStyle.palette.spacing;
        var xPos = this.$paletteInner.width() / 2;
        typeData.$canvas.attr('width', this.$paletteInner.width());
        typeData.context.clearRect(0, 0, typeData.$canvas.width(), typeData.$canvas.height());
        typeData.context.save();
        this.__updateNodes(typeData.nodes, elapsed);

        for (var i = 0; i < typeData.nodes.length; ++i) {
          var drawData = this.__drawNode(typeData.nodes[i], {x: xPos, y: yPos}, typeData.context, true);
          yPos += drawData.rect.height + this._drawStyle.palette.spacing;
        }

        typeData.context.restore();
      }
    }
  },

  /**
   * Draws a list of nodes on the canvas.
   * @function wcPlayEditor#__drawNodes
   * @private
   * @param {wcNode[]} nodes - The node to render.
   * @param {external:Canvas~Context} context - The canvas context to render on.
   * @param {Boolean} [hideCollapsible] - If true, all collapsible properties will be hidden, even if the node is not collapsed.
   */
  __drawNodes: function(nodes, context, hideCollapsible) {
    for (var i = 0; i < nodes.length; ++i) {
      this.__drawNode(nodes[i], nodes[i].pos, context, hideCollapsible);
    }
  },

  /**
   * Draws a single node on the canvas at a given position.
   * @function wcPlayEditor#__drawNode
   * @private
   * @param {wcNode} node - The node to render.
   * @param {wcPlay~Coordinates} pos - The position to render the node in the canvas, relative to the top-middle of the node.
   * @param {external:Canvas~Context} context - The canvas context to render on.
   * @param {Boolean} [hideCollapsible] - If true, all collapsible properties will be hidden, even if the node is not collapsed.
   * @returns {wcPlayEditor~DrawNodeData} - Data associated with the newly drawn node.
   */
  __drawNode: function(node, pos, context, hideCollapsible) {
    var data = {
      node: node,
      rect: {
        top: pos.y,
        left: pos.x,
        width: 0,
        height: 0,
      },
    };

    // TODO: Ignore drawing if the node is outside of view.

    // Take some measurements so we know where everything on the node should be drawn.
    var entryBounds  = this.__measureEntryLinks(node, context, pos);
    var centerBounds = this.__measureCenter(node, context, {x: pos.x, y: pos.y + entryBounds.height}, hideCollapsible);
    var exitBounds   = this.__measureExitLinks(node, context, {x: pos.x, y: pos.y + entryBounds.height + centerBounds.height});

    var bounds = this.__expandRect([entryBounds, centerBounds, exitBounds]);
    bounds.top = centerBounds.top;
    bounds.height = centerBounds.height;

    // Now use our measurements to draw our node.
    var propBounds  = this.__drawCenter(node, context, bounds, hideCollapsible);
    var entryLinkBounds = this.__drawEntryLinks(node, context, pos, entryBounds.width);
    var exitLinkBounds = this.__drawExitLinks(node, context, {x: pos.x, y: pos.y + entryBounds.height + centerBounds.height}, exitBounds.width);

    data.entryBounds = entryLinkBounds;
    data.exitBounds = exitLinkBounds;
    data.inputBounds = propBounds.inputBounds;
    data.outputBounds = propBounds.outputBounds;
    data.valueBounds = propBounds.valueBounds;
    data.initialBounds = propBounds.initialBounds;

    data.inner = this.__expandRect([centerBounds]);
    data.rect = this.__expandRect([entryBounds, centerBounds, exitBounds]);
    data.inner.left = data.rect.left;
    data.inner.width = data.rect.width;
    data.rect.left -= this._drawStyle.links.length;
    data.rect.width += this._drawStyle.links.length * 2 + 3;
    data.rect.height += 3;

    if (node.chain.entry.length) {
      data.inner.top -= this._drawStyle.links.padding + this._font.links.size;
      data.inner.height += this._drawStyle.links.padding + this._font.links.size;
    } else {
      data.rect.top -= this._drawStyle.links.length;
      data.rect.height += this._drawStyle.links.length;
    }
    if (node.chain.exit.length) {
      data.inner.height += this._drawStyle.links.padding + this._font.links.size;
    } else {
      data.rect.height += this._drawStyle.links.length;
    }

    data.farRect = {
      top: data.inner.top - data.inner.height/4,
      left: data.inner.left - data.inner.width/4,
      width: data.inner.width * 1.5,
      height: data.inner.height * 1.5,
    };

    // Add a collapse button to the node in the left margin of the title.
    data.collapser = {
      left: data.inner.left + 4,
      top: data.inner.top + 4 + (node.chain.entry.length? this._font.links.size + this._drawStyle.links.padding: 0),
      width: this._drawStyle.node.margin - 5,
      height: this._font.title.size - 4,
    };

    context.save();
    context.fillStyle = (this._highlightCollapser && this._highlightNode === node? "darkgray": "white");
    context.strokeStyle = "black";
    context.lineWidth = 1;
    context.fillRect(data.collapser.left, data.collapser.top, data.collapser.width, data.collapser.height);
    context.strokeRect(data.collapser.left, data.collapser.top, data.collapser.width, data.collapser.height);

    context.strokeStyle = "black";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(data.collapser.left + 1, data.collapser.top + data.collapser.height/2);
    context.lineTo(data.collapser.left + data.collapser.width - 1, data.collapser.top + data.collapser.height/2);
    if (node.collapsed()) {
      context.moveTo(data.collapser.left + data.collapser.width/2, data.collapser.top + 1);
      context.lineTo(data.collapser.left + data.collapser.width/2, data.collapser.top + data.collapser.height - 1);
    }
    context.stroke();
    context.restore();

    // Add breakpoint button to the node in the right margin of the title.
    data.breakpoint = {
      left: data.inner.left + data.inner.width - this._drawStyle.node.margin + 2,
      top: data.inner.top + 4 + (node.chain.entry.length? this._font.links.size + this._drawStyle.links.padding: 0),
      width: this._drawStyle.node.margin - 5,
      height: this._font.title.size - 4,
    };

    context.save();
    context.fillStyle = (this._highlightBreakpoint && this._highlightNode === node? "darkgray": "white");
    context.fillRect(data.breakpoint.left, data.breakpoint.top, data.breakpoint.width, data.breakpoint.height);

    context.strokeStyle = (node._break? "darkred": "black");
    context.fillStyle = "darkred";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(data.breakpoint.left + data.breakpoint.width/2, data.breakpoint.top + data.breakpoint.height/2, Math.min(data.breakpoint.width/2-2, data.breakpoint.height/2-2), 0, 2 * Math.PI);
    node._break && context.fill();
    context.stroke();

    context.strokeStyle = "black";
    context.lineWidth = 1;
    context.strokeRect(data.breakpoint.left, data.breakpoint.top, data.breakpoint.width, data.breakpoint.height);
    context.restore();

    // DEBUG: Render bounding box geometry.
    // context.strokeStyle = "red";
    // function __drawBoundList(list) {
    //   for (var i = 0; i < list.length; ++i) {
    //     context.strokeRect(list[i].rect.left, list[i].rect.top, list[i].rect.width, list[i].rect.height);
    //   };
    // }
    // __drawBoundList(data.entryBounds);
    // __drawBoundList(data.exitBounds);
    // __drawBoundList(data.inputBounds);
    // __drawBoundList(data.outputBounds);
    // __drawBoundList(data.valueBounds);
    // context.strokeRect(entryBounds.left, entryBounds.top, entryBounds.width, entryBounds.height);
    // context.strokeRect(exitBounds.left, exitBounds.top, exitBounds.width, exitBounds.height);
    // context.strokeRect(data.inner.left, data.inner.top, data.inner.width, data.inner.height);
    // context.strokeRect(data.rect.left, data.rect.top, data.rect.width, data.rect.height);

    // Increase the nodes border thickness when flashing.
    if (node._meta.flashDelta) {
      if (node._meta.paused) {
        this.__drawRoundedRect(data.inner, "#CC0000", 5, 10, context);
      } else {
        this.__drawRoundedRect(data.inner, "yellow", 2, 10, context);
      }
    }

    // Show an additional bounding rect around selected nodes.
    if (this._selectedNodes.indexOf(node) > -1) {
      this.__drawRoundedRect(data.rect, "cyan", 2, 10, context);
    }

    node._meta.bounds = data;
    return data;
  },

  /**
   * Measures the space to render entry links for a node.
   * @function wcPlayEditor#__measureEntryLinks
   * @private
   * @param {wcNode} node - The node to measure.
   * @param {external:Canvas~Context} context - The canvas context.
   * @param {wcPlay~Coordinates} pos - The (top, center) position to measure the links.
   * @returns {wcPlayEditor~Rect} - A bounding rectangle.
   */
  __measureEntryLinks: function(node, context, pos) {
    var bounds = {
      top: pos.y,
      left: pos.x,
      width: 0,
      height: 0,
    };

    this.__setCanvasFont(this._font.links, context);

    var collapsed = node.collapsed();
    var links = node.chain.entry;
    for (var i = 0; i < links.length; ++i) {
      if (!collapsed || links[i].links.length) {
        bounds.width += context.measureText(links[i].name).width + this._drawStyle.links.spacing;
      }
    }

    bounds.left -= bounds.width/2 + this._drawStyle.links.margin;
    bounds.width += this._drawStyle.links.margin * 2;
    if (node.chain.entry.length) {
      bounds.height = this._font.links.size + this._drawStyle.links.padding + this._drawStyle.links.length;
    }
    return bounds;
  },

  /**
   * Measures the space to render exit links for a node.
   * @function wcPlayEditor#__measureExitLinks
   * @private
   * @param {wcNode} node - The node to measure.
   * @param {external:Canvas~Context} context - The canvas context.
   * @param {wcPlay~Coordinates} pos - The (top, center) position to measure the links.
   * @returns {wcPlayEditor~Rect} - A bounding rectangle.
   */
  __measureExitLinks: function(node, context, pos) {
    var bounds = {
      top: pos.y,
      left: pos.x,
      width: 0,
      height: 0,
    };

    this.__setCanvasFont(this._font.links, context);

    var collapsed = node.collapsed();
    var links = node.chain.exit;
    for (var i = 0; i < links.length; ++i) {
      if (!collapsed || links[i].links.length) {
        bounds.width += context.measureText(links[i].name).width + this._drawStyle.links.spacing;
      }
    }

    bounds.left -= bounds.width/2 + this._drawStyle.links.margin;
    bounds.width += this._drawStyle.links.margin * 2;
    if (node.chain.exit.length) {
      bounds.height = this._font.links.size + this._drawStyle.links.padding + this._drawStyle.links.length;
    }
    return bounds;
  },

  /**
   * Measures the space to render the center area for a node.
   * @function wcPlayEditor#__measureCenter
   * @private
   * @param {wcNode} node - The node to measure.
   * @param {external:Canvas~Context} context - The canvas context.
   * @param {wcPlay~Coordinates} pos - The (top, center) position to measure.
   * @param {Boolean} [hideCollapsible] - If true, all collapsible properties will be hidden, even if the node is not collapsed.
   * @returns {wcPlayEditor~Rect} - A bounding rectangle. The height is only the amount of space rendered within the node bounds (links stick out).
   */
  __measureCenter: function(node, context, pos, hideCollapsible) {
    var bounds = {
      top: pos.y,
      left: pos.x,
      width: 0,
      height: this._font.title.size + this._drawStyle.title.spacing + this._drawStyle.links.padding,
    };

    // Measure the title bar area.
    this.__setCanvasFont(this._font.title, context);
    bounds.width = context.measureText(node.type + (node.name? ': ' + node.name: '')).width;

    // Measure the node's viewport.
    if (node._viewportSize) {
      bounds.width = Math.max(bounds.width, node._viewportSize.x);
      bounds.height += node._viewportSize.y + this._drawStyle.property.spacing;
    }

    // Measure properties.
    var collapsed = node.collapsed();
    var props = node.properties;
    for (var i = 0; i < props.length; ++i) {
      // Skip properties that are collapsible if it is not chained.
      if ((!collapsed && !hideCollapsible) || !props[i].options.collapsible || props[i].inputs.length || props[i].outputs.length) {
        bounds.height += this._font.property.size + this._drawStyle.property.spacing;

        // Property name.
        this.__setCanvasFont(this._font.property, context);
        var w = context.measureText(props[i].name + ': ').width;

        // Property value.
        this.__setCanvasFont(this._font.value, context);
        w += context.measureText(this._drawStyle.property.valueWrapL + this.__clampString(node.property(props[i].name).toString(), this._drawStyle.property.strLen) + this._drawStyle.property.valueWrapR).width;

        // Property initial value.
        this.__setCanvasFont(this._font.initialValue, context);
        w += context.measureText(this._drawStyle.property.initialWrapL + this.__clampString(node.initialProperty(props[i].name).toString(), this._drawStyle.property.strLen) + this._drawStyle.property.initialWrapR).width;
        bounds.width = Math.max(w, bounds.width);
      }
    }

    bounds.left -= bounds.width/2 + this._drawStyle.node.margin;
    bounds.width += this._drawStyle.node.margin * 2;
    return bounds;
  },

  /**
   * Draws the entry links of a node.
   * @function wcPlayEditor#__drawEntryLinks
   * @private
   * @param {wcNode} node - The node to draw.
   * @param {external:Canvas~Context} context - The canvas context.
   * @param {wcPlay~Coordinates} pos - The (top, center) position to draw the links on the canvas.
   * @param {Number} width - The width of the area to draw in.
   * @returns {wcPlayEditor~BoundingData[]} - An array of bounding rectangles, one for each link 'nub'.
   */
  __drawEntryLinks: function(node, context, pos, width) {
    var xPos = pos.x - width/2 + this._drawStyle.links.margin;
    var yPos = pos.y + this._drawStyle.links.length + this._font.links.size;

    this.__setCanvasFont(this._font.links, context);

    var result = [];

    var collapsed = node.collapsed();
    var links = node.chain.entry;
    for (var i = 0; i < links.length; ++i) {
      if (!collapsed || links[i].links.length) {
        // Link label
        context.fillStyle = "black";
        var w = context.measureText(links[i].name).width + this._drawStyle.links.spacing;
        context.fillText(links[i].name, xPos + this._drawStyle.links.spacing/2, yPos);

        // Link nub
        var rect = {
          top: yPos - this._drawStyle.links.length - this._font.links.size,
          left: xPos + w/2 - this._drawStyle.links.width/2,
          width: this._drawStyle.links.width,
          height: this._drawStyle.links.length,
        };

        context.fillStyle = (this._highlightEntryLink && this._highlightEntryLink.name === links[i].name && this._highlightNode === node? "cyan": links[i].meta.color);
        context.strokeStyle = "black";
        context.beginPath();
        context.moveTo(rect.left, rect.top);
        context.lineTo(rect.left + rect.width/2, rect.top + rect.height/3);
        context.lineTo(rect.left + rect.width, rect.top);
        context.lineTo(rect.left + rect.width, rect.top + rect.height);
        context.lineTo(rect.left, rect.top + rect.height);
        context.closePath();
        context.stroke();
        context.fill();

        // Expand the bounding rect just a little so it is easier to click.
        rect.left -= 5;
        rect.width += 10;

        result.push({
          rect: rect,
          point: {
            x: rect.left + rect.width/2,
            y: rect.top + rect.height/3 - 2,
          },
          name: links[i].name,
        });

        xPos += w;
      }
    }

    return result;
  },

  /**
   * Draws the exit links of a node.
   * @function wcPlayEditor#__drawExitLinks
   * @private
   * @param {wcNode} node - The node to draw.
   * @param {external:Canvas~Context} context - The canvas context.
   * @param {wcPlay~Coordinates} pos - The (top, center) position to draw the links on the canvas.
   * @param {Number} width - The width of the area to draw in.
   * @returns {wcPlayEditor~BoundingData[]} - An array of bounding rectangles, one for each link 'nub'.
   */
  __drawExitLinks: function(node, context, pos, width) {
    var xPos = pos.x - width/2 + this._drawStyle.links.margin;
    var yPos = pos.y + this._font.links.size;

    this.__setCanvasFont(this._font.links, context);

    var result = [];

    var collapsed = node.collapsed();
    var links = node.chain.exit;
    for (var i = 0; i < links.length; ++i) {
      if (!collapsed || links[i].links.length) {
        // Link label
        context.fillStyle = "black";
        var w = context.measureText(links[i].name).width + this._drawStyle.links.spacing;
        context.fillText(links[i].name, xPos + this._drawStyle.links.spacing/2, yPos);

        // Link nub
        var rect = {
          top: yPos + this._drawStyle.links.padding,
          left: xPos + w/2 - this._drawStyle.links.width/2,
          width: this._drawStyle.links.width,
          height: this._drawStyle.links.length,
        };

        context.fillStyle = (this._highlightExitLink && this._highlightExitLink.name === links[i].name && this._highlightNode === node? "cyan": links[i].meta.color);
        context.strokeStyle = "black";
        context.beginPath();
        context.moveTo(rect.left, rect.top);
        context.lineTo(rect.left + rect.width, rect.top);
        context.lineTo(rect.left + rect.width, rect.top + rect.height/2);
        context.lineTo(rect.left + rect.width/2, rect.top + rect.height);
        context.lineTo(rect.left, rect.top + rect.height/2);
        context.closePath();
        context.stroke();
        context.fill();

        // Expand the bounding rect just a little so it is easier to click.
        rect.left -= 5;
        rect.width += 10;

        result.push({
          rect: rect,
          point: {
            x: rect.left + rect.width/2,
            y: rect.top + rect.height + 1,
          },
          name: links[i].name,
        });

        xPos += w;
      }
    }

    return result;
  },

  /**
   * Measures the space to render the center area for a node.
   * @function wcPlayEditor#__drawCenter
   * @private
   * @param {wcNode} node - The node to draw.
   * @param {external:Canvas~Context} context - The canvas context.
   * @param {wcPlayEditor~Rect} rect - The bounding area to draw in.
   * @param {Boolean} [hideCollapsible] - If true, all collapsible properties will be hidden, even if the node is not collapsed.
   * @returns {wcPlayEditor~DrawPropertyData} - Contains bounding rectangles for various drawings.
   */
  __drawCenter: function(node, context, rect, hideCollapsible) {
    var upper = node.chain.entry.length? this._font.links.size + this._drawStyle.links.padding: 0;
    var lower = node.chain.exit.length? this._font.links.size + this._drawStyle.links.padding: 0;

    // Node background
    context.save();
      var left = rect.left + rect.width/2;
      var top = rect.top + (rect.height)/2;
      var gradient = context.createRadialGradient(left, top, 10, left, top, Math.max(rect.width, rect.height));
      gradient.addColorStop(0, node._meta.color);
      gradient.addColorStop(1, "white");
      context.fillStyle = context.strokeStyle = gradient;
      context.lineJoin = "round";
      var diameter = this._drawStyle.node.radius*2;
      context.lineWidth = diameter;
      context.fillRect(rect.left + diameter/2, rect.top - upper + diameter/2, rect.width - diameter, rect.height + upper + lower - diameter);
      context.strokeRect(rect.left + diameter/2, rect.top - upper + diameter/2, rect.width - diameter, rect.height + upper + lower - diameter);
    context.restore();
    this.__drawRoundedRect({
      left: rect.left,
      top: rect.top - upper,
      width: rect.width,
      height: rect.height + upper + lower
    }, node._meta.color, 3, this._drawStyle.node.radius, context);

    // Title Upper Bar
    upper = 0;
    if (node.chain.entry.length) {
      context.strokeStyle = node._meta.color;
      context.beginPath();
      context.moveTo(rect.left, rect.top + upper);
      context.lineTo(rect.left + rect.width, rect.top + upper);
      context.stroke();
    }

    // Title Text
    context.save();
    upper += this._font.title.size;
    context.fillStyle = "black";
    context.strokeStyle = "black";
    context.textAlign = "center";
    this.__setCanvasFont(this._font.title, context);
    context.fillText(node.type + (node.name? ': ' + node.name: ''), rect.left + rect.width/2, rect.top + upper);
    context.restore();

    // Title Lower Bar
    upper += this._drawStyle.title.spacing;
    // context.strokeStyle = node._meta.color;
    // context.beginPath();
    // context.moveTo(rect.left, rect.top + upper);
    // context.lineTo(rect.left + rect.width, rect.top + upper);
    // context.stroke();

    // Draw the node's viewport.
    if (node._viewportSize) {
      // Calculate the translation to make the viewport 0,0.
      var corner = {
        x: -this._viewportCamera.x + rect.left + (rect.width/2 - node._viewportSize.x/2),
        y: -this._viewportCamera.y + rect.top + upper,
      };

      context.save();
      // Translate the canvas so 0,0 is the beginning of the viewport.
      context.translate(corner.x, corner.y);

      // Draw the viewport.
      node.onViewport(context);

      // Now revert the translation.
      context.translate(-corner.x, -corner.y);
      context.restore();

      upper += node._viewportSize.y + this._drawStyle.property.spacing;
    }

    // Properties
    var result = {
      valueBounds:  [],
      initialBounds:[],
      inputBounds:  [],
      outputBounds: [],
    };
    var linkRect;

    context.save();
    var collapsed = node.collapsed();
    var props = node.properties;
    for (var i = 0; i < props.length; ++i) {

      // Skip properties that are collapsible if it is not chained.
      if ((!collapsed && !hideCollapsible) || !props[i].options.collapsible || props[i].inputs.length || props[i].outputs.length) {
        upper += this._font.property.size;

        // Property name.
        context.fillStyle = "black";
        context.textAlign = "left";
        this.__setCanvasFont(this._font.property, context);
        context.fillText(props[i].name + ': ', rect.left + this._drawStyle.node.margin, rect.top + upper);

        // Initial property value.
        context.textAlign = "right";
        this.__setCanvasFont(this._font.initialValue, context);
        var w = context.measureText(this._drawStyle.property.initialWrapL + this.__clampString(node.initialProperty(props[i].name).toString(), this._drawStyle.property.strLen) + this._drawStyle.property.initialWrapR).width;

        var initialBound = {
          rect: {
            top: rect.top + upper - this._font.property.size,
            left: rect.left + rect.width - this._drawStyle.node.margin - w,
            width: w,
            height: this._font.property.size + this._drawStyle.property.spacing,
          },
          name: props[i].name,
        };
        result.initialBounds.push(initialBound);

        // Property value.
        this.__setCanvasFont(this._font.value, context);
        var vw = context.measureText(this._drawStyle.property.valueWrapL + this.__clampString(node.property(props[i].name).toString(), this._drawStyle.property.strLen) + this._drawStyle.property.valueWrapR).width;

        var valueBound = {
          rect: {
            top: rect.top + upper - this._font.property.size,
            left: rect.left + rect.width - this._drawStyle.node.margin - vw - w,
            width: vw,
            height: this._font.property.size + this._drawStyle.property.spacing,
          },
          name: props[i].name,
        };
        result.valueBounds.push(valueBound);

        // Highlight hovered values.
        if (this._highlightNode === node && this._highlightPropertyValue && this._highlightPropertyValue.name === props[i].name) {
          context.fillStyle = "darkgray";
          context.fillRect(valueBound.rect.left, valueBound.rect.top, valueBound.rect.width, valueBound.rect.height);
        }
        if (this._highlightNode === node && this._highlightPropertyInitialValue && this._highlightPropertyInitialValue.name === props[i].name) {
          context.fillStyle = "darkgray";
          context.fillRect(initialBound.rect.left, initialBound.rect.top, initialBound.rect.width, initialBound.rect.height);
        }

        this.__setCanvasFont(this._font.initialValue, context);
        context.fillStyle = "#444444";
        context.fillText(this._drawStyle.property.initialWrapL + this.__clampString(node.initialProperty(props[i].name).toString(), this._drawStyle.property.strLen) + this._drawStyle.property.initialWrapR, rect.left + rect.width - this._drawStyle.node.margin, rect.top + upper);

        this.__setCanvasFont(this._font.value, context);
        context.fillStyle = "black";
        context.fillText(this._drawStyle.property.valueWrapL + this.__clampString(node.property(props[i].name).toString(), this._drawStyle.property.strLen) + this._drawStyle.property.valueWrapR, rect.left + rect.width - this._drawStyle.node.margin - w, rect.top + upper);

        // Property input.
        if (!collapsed || props[i].inputs.length) {
          linkRect = {
            top: rect.top + upper - this._font.property.size/3 - this._drawStyle.links.width/2,
            left: rect.left - this._drawStyle.links.length,
            width: this._drawStyle.links.length,
            height: this._drawStyle.links.width,
          };

          context.fillStyle = (this._highlightInputLink && this._highlightInputLink.name === props[i].name && this._highlightNode === node? "cyan": props[i].inputMeta.color);
          context.strokeStyle = "black";
          context.beginPath();
          context.moveTo(linkRect.left, linkRect.top);
          context.lineTo(linkRect.left + linkRect.width, linkRect.top);
          context.lineTo(linkRect.left + linkRect.width, linkRect.top + linkRect.height);
          context.lineTo(linkRect.left, linkRect.top + linkRect.height);
          context.lineTo(linkRect.left + linkRect.width/3, linkRect.top + linkRect.height/2);
          context.closePath();
          context.stroke();
          context.fill();

          // Expand the bounding rect just a little so it is easier to click.
          linkRect.top -= 5;
          linkRect.height += 10;

          result.inputBounds.push({
            rect: linkRect,
            point: {
              x: linkRect.left + linkRect.width/3 - 2,
              y: linkRect.top + linkRect.height/2,
            },
            name: props[i].name,
          });
        }

        // Property output.
        if (!collapsed || props[i].outputs.length) {
          linkRect = {
            top: rect.top + upper - this._font.property.size/3 - this._drawStyle.links.width/2,
            left: rect.left + rect.width,
            width: this._drawStyle.links.length,
            height: this._drawStyle.links.width,
          }

          context.fillStyle = (this._highlightOutputLink && this._highlightOutputLink.name === props[i].name && this._highlightNode === node? "cyan": props[i].outputMeta.color);
          context.strokeStyle = "black";
          context.beginPath();
          context.moveTo(linkRect.left, linkRect.top);
          context.lineTo(linkRect.left + linkRect.width/2, linkRect.top);
          context.lineTo(linkRect.left + linkRect.width, linkRect.top + linkRect.height/2);
          context.lineTo(linkRect.left + linkRect.width/2, linkRect.top + linkRect.height);
          context.lineTo(linkRect.left, linkRect.top + linkRect.height);
          context.closePath();
          context.stroke();
          context.fill();

          // Expand the bounding rect just a little so it is easier to click.
          linkRect.top -= 5;
          linkRect.height += 10;

          result.outputBounds.push({
            rect: linkRect,
            point: {
              x: linkRect.left + linkRect.width + 1,
              y: linkRect.top + linkRect.height/2,
            },
            name: props[i].name,
          });
        }

        upper += this._drawStyle.property.spacing;
      }
    }
    context.restore();

    // Lower Bar
    if (node.chain.exit.length) {
      context.strokeStyle = node._meta.color;
      context.beginPath();
      context.moveTo(rect.left, rect.top + rect.height);
      context.lineTo(rect.left + rect.width, rect.top + rect.height);
      context.stroke();
    }
    return result;
  },

  /**
   * Draws connection chains for a list of nodes.
   * @function wcPlayEditor#__drawChains
   * @private
   * @param {wcNode[]} nodes - A list of nodes to render chains for.
   * @param {external:Canvas~Context} context - The canvas context.
   */
  __drawChains: function(nodes, context) {
    for (var i = 0; i < nodes.length; ++i) {
      this.__drawNodeChains(nodes[i], context);
    }
  },

  /**
   * Draws connection chains for a single node.
   * @function wcPlayEditor#__drawNodeChains
   * @private
   * @param {wcNode} node - A node to render chains for.
   * @param {external:Canvas~Context} context - The canvas context.
   */
  __drawNodeChains: function(node, context) {
    for (var i = 0; i < node.chain.exit.length; ++i) {
      var exitLink = node.chain.exit[i];

      // Skip links that are not chained with anything.
      if (!exitLink.links.length) {
        continue;
      }

      var exitPoint;
      // Find the corresponding meta data for this link.
      for (var a = 0; a < node._meta.bounds.exitBounds.length; ++a) {
        if (node._meta.bounds.exitBounds[a].name === exitLink.name) {
          exitPoint = node._meta.bounds.exitBounds[a].point;
          break;
        }
      }

      // Skip links that do not contain meta data (should not happen).
      if (!exitPoint) {
        console.log('ERROR: Attempted to draw chains for an exit link that has no meta data.');
        continue;
      }

      // Follow each chain to their entry links.
      for (var a = 0; a < exitLink.links.length; ++a) {
        var targetNode = exitLink.links[a].node;
        var targetName = exitLink.links[a].name;
        var entryLink;

        for (var b = 0; b < targetNode.chain.entry.length; ++b) {
          if (targetNode.chain.entry[b].name === targetName) {
            entryLink = targetNode.chain.entry[b];
            break;
          }
        }

        // The link for this chain was not found.
        if (!entryLink) {
          console.log('ERROR: Attempted to chain an exit link to an entry link that was not found.');
          continue;
        }

        // Find the corresponding meta data for this link.
        var entryPoint;
        for (var b = 0; b < targetNode._meta.bounds.entryBounds.length; ++b) {
          if (targetNode._meta.bounds.entryBounds[b].name === entryLink.name) {
            entryPoint = targetNode._meta.bounds.entryBounds[b].point;
            break;
          }
        }

        // Could not find meta data for this link.
        if (!entryPoint) {
          console.log('ERROR: Attempted to draw chains to an entry link that has no meta data.');
          continue;
        }

        var flash = (exitLink.meta.flashDelta > 0 && entryLink.meta.flashDelta > 0);

        var highlight = 
          (this._highlightNode === targetNode && this._highlightEntryLink && this._highlightEntryLink.name === entryLink.name) ||
          (this._highlightNode === node && this._highlightExitLink && this._highlightExitLink.name === exitLink.name);

        // Now we have both our links, lets chain them together!
        this.__drawFlowChain(exitPoint, entryPoint, node._meta.bounds.rect, targetNode._meta.bounds.rect, context, flash, highlight);
      }
    }

    for (var i = 0; i < node.properties.length; ++i) {
      var outputProp = node.properties[i];

      // Skip properties with no output links.
      if (!outputProp.outputs.length) {
        continue;
      }

      // Find the corresponding meta data for this link.
      var outputPoint;
      for (var a = 0; a < node._meta.bounds.outputBounds.length; ++a) {
        if (node._meta.bounds.outputBounds[a].name === outputProp.name) {
          outputPoint = node._meta.bounds.outputBounds[a].point;
          break;
        }
      }

      // Failed to find bounds for the output link.
      if (!outputPoint) {
        console.log('ERROR: Attempted to draw chains for an output link that has no meta data.');
        continue;
      }

      // Follow each chain to their input links.
      for (var a = 0; a < outputProp.outputs.length; ++a) {
        var targetNode = outputProp.outputs[a].node;
        var targetName = outputProp.outputs[a].name;
        var inputProp;

        for (var b = 0; b < targetNode.properties.length; ++b) {
          if (targetNode.properties[b].name === targetName) {
            inputProp = targetNode.properties[b];
          }
        }

        // Failed to find the input property to link with.
        if (!inputProp) {
          console.log('ERROR: Attempted to chain a property link to a property that was not found.');
          continue;
        }

        // Find the corresponding meta data for this link.
        var inputPoint;
        for (var b = 0; b < targetNode._meta.bounds.inputBounds.length; ++b) {
          if (targetNode._meta.bounds.inputBounds[b].name === inputProp.name) {
            inputPoint = targetNode._meta.bounds.inputBounds[b].point;
            break;
          }
        }

        // Failed to find the meta data for a property input link.
        if (!inputPoint) {
          console.log('ERROR: Attempted to draw chains to a property input link that has no meta data.');
          continue;
        }

        var flash = (outputProp.outputMeta.flashDelta > 0 && inputProp.inputMeta.flashDelta > 0);
        var highlight =
          (this._highlightNode === targetNode && this._highlightInputLink && this._highlightInputLink.name === inputProp.name) ||
          (this._highlightNode === node && this._highlightOutputLink && this._highlightOutputLink.name === outputProp.name);

        // Now we have both our links, lets chain them together!
        this.__drawPropertyChain(outputPoint, inputPoint, node._meta.bounds.rect, targetNode._meta.bounds.rect, context, flash, highlight);
      }
    }

    // Draw a link to the mouse cursor if we are making a connection.
    if (this._selectedNode === node && this._selectedEntryLink) {
      var targetPos;
      var targetRect = null;
      var highlight = false;
      if (this._highlightNode && this._highlightExitLink) {
        targetPos = this._highlightExitLink.point;
        targetRect = this._highlightExitLink.rect;
        highlight = true;
      } else {
        targetPos = {
          x: (this._mouse.x - this._viewportCamera.x) / this._viewportCamera.z,
          y: (this._mouse.y - this._viewportCamera.y) / this._viewportCamera.z,
        };
        targetRect = {
          left: targetPos.x,
          top: targetPos.y,
          width: 1,
          height: 1,
        };
      }

      // In case our selected node gets uncollapsed, get the current position of the link.
      var point;
      for (var i = 0; i < node._meta.bounds.entryBounds.length; ++i) {
        if (node._meta.bounds.entryBounds[i].name === this._selectedEntryLink.name) {
          point = node._meta.bounds.entryBounds[i].point;
        }
      }

      this.__drawFlowChain(targetPos, point, targetRect, node._meta.bounds.rect, context, highlight);
    }

    if (this._selectedNode === node && this._selectedExitLink) {
      var targetPos;
      var targetRect = null;
      var highlight = false;
      if (this._highlightNode && this._highlightEntryLink) {
        targetPos = this._highlightEntryLink.point;
        targetRect = this._highlightEntryLink.rect;
        highlight = true;
      } else {
        targetPos = {
          x: (this._mouse.x - this._viewportCamera.x) / this._viewportCamera.z,
          y: (this._mouse.y - this._viewportCamera.y) / this._viewportCamera.z,
        };
        targetRect = {
          left: targetPos.x,
          top: targetPos.y,
          width: 1,
          height: 1,
        };
      }

      // In case our selected node gets uncollapsed, get the current position of the link.
      var point;
      for (var i = 0; i < node._meta.bounds.exitBounds.length; ++i) {
        if (node._meta.bounds.exitBounds[i].name === this._selectedExitLink.name) {
          point = node._meta.bounds.exitBounds[i].point;
        }
      }

      this.__drawFlowChain(point, targetPos, node._meta.bounds.rect, targetRect, context, highlight);
    }

    if (this._selectedNode === node && this._selectedInputLink) {
      var targetPos;
      var targetRect = null;
      var highlight = false;
      if (this._highlightNode && this._highlightOutputLink) {
        targetPos = this._highlightOutputLink.point;
        targetRect = this._highlightOutputLink.rect;
        highlight = true;
      } else {
        targetPos = {
          x: (this._mouse.x - this._viewportCamera.x) / this._viewportCamera.z,
          y: (this._mouse.y - this._viewportCamera.y) / this._viewportCamera.z,
        };
        targetRect = {
          left: targetPos.x,
          top: targetPos.y,
          width: 1,
          height: 1,
        };
      }

      // In case our selected node gets uncollapsed, get the current position of the link.
      var point;
      for (var i = 0; i < node._meta.bounds.inputBounds.length; ++i) {
        if (node._meta.bounds.inputBounds[i].name === this._selectedInputLink.name) {
          point = node._meta.bounds.inputBounds[i].point;
        }
      }

      this.__drawPropertyChain(targetPos, point, targetRect, node._meta.bounds.rect, context, highlight);
    }

    if (this._selectedNode === node && this._selectedOutputLink) {
      var targetPos;
      var targetRect = null;
      var highlight = false;
      if (this._highlightNode && this._highlightInputLink) {
        targetPos = this._highlightInputLink.point;
        targetRect = this._highlightInputLink.rect;
        highlight = true;
      } else {
        targetPos = {
          x: (this._mouse.x - this._viewportCamera.x) / this._viewportCamera.z,
          y: (this._mouse.y - this._viewportCamera.y) / this._viewportCamera.z,
        };
        targetRect = {
          left: targetPos.x,
          top: targetPos.y,
          width: 1,
          height: 1,
        };
      }

      // In case our selected node gets uncollapsed, get the current position of the link.
      var point;
      for (var i = 0; i < node._meta.bounds.outputBounds.length; ++i) {
        if (node._meta.bounds.outputBounds[i].name === this._selectedOutputLink.name) {
          point = node._meta.bounds.outputBounds[i].point;
        }
      }

      this.__drawPropertyChain(point, targetPos, node._meta.bounds.rect, targetRect, context, highlight);
    }
  },

  /**
   * Draws a connection chain between an exit link and an entry link.
   * @function wcPlayEditor#__drawFlowChain
   * @private
   * @param {wcPlay~Coordinates} startPos - The start position (the exit link).
   * @param {wcPlay~Coordinates} endPos - The end position (the entry link).
   * @param {wcPlayEditor~Rect} startRect - The start node's bounding rect to avoid.
   * @param {wcPlayEditor~Rect} endPos - The end node's bounding rect to avoid.
   * @param {Boolean} [flash] - If true, will flash the link.
   * @param {external:Canvas~Context} context - The canvas context.
   */
  __drawFlowChain: function(startPos, endPos, startRect, endRect, context, flash, highlight) {
    context.save();
    context.strokeStyle = (highlight? 'cyan': (flash? '#CCCC00': '#000000'));
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(startPos.x, startPos.y);

    var coreRadius = 25;

    // If the exit link is above the entry link
    if (startPos.y < endPos.y) {
      var midx = (endPos.x + startPos.x) / 2;
      var midy = (endPos.y + startPos.y) / 2;
      var radius = Math.min(coreRadius, Math.abs(endPos.x - startPos.x)/2, Math.abs(endPos.y - startPos.y)/2);
      context.arcTo(startPos.x, midy, midx, midy, radius);
      context.arcTo(endPos.x, midy, endPos.x, endPos.y, radius);
    }
    // If the start rect is to the left side of the end rect.
    else if (startRect.left + startRect.width < endRect.left) {
      var midx = (endRect.left + startRect.left + startRect.width) / 2;
      var midy = (endPos.y + startPos.y) / 2;
      var leftx = (midx + startPos.x) / 2;
      var rightx = (endPos.x + midx) / 2;
      var radius = Math.min(coreRadius, Math.abs(endPos.y - startPos.y)/4, Math.abs(midx - leftx), Math.abs(midx - rightx));
      context.arcTo(startPos.x, startPos.y + radius, leftx, startPos.y + radius, radius);
      context.arcTo(midx, startPos.y + radius, midx, midy, radius);
      context.arcTo(midx, endPos.y - radius, rightx, endPos.y - radius, radius);
      context.arcTo(endPos.x, endPos.y - radius, endPos.x, endPos.y, radius);
    }
    // If the start rect is to the right side of the end rect.
    else if (startRect.left > endRect.left + endRect.width) {
      var midx = (startRect.left + endRect.left + endRect.width) / 2;
      var midy = (endPos.y + startPos.y) / 2;
      var leftx = (midx + endPos.x) / 2;
      var rightx = (startPos.x + midx) / 2;
      var radius = Math.min(coreRadius, Math.abs(endPos.y - startPos.y)/4, Math.abs(midx - leftx), Math.abs(midx - rightx));
      context.arcTo(startPos.x, startPos.y + radius, rightx, startPos.y + radius, radius);
      context.arcTo(midx, startPos.y + radius, midx, midy, radius);
      context.arcTo(midx, endPos.y - radius, leftx, endPos.y - radius, radius);
      context.arcTo(endPos.x, endPos.y - radius, endPos.x, endPos.y, radius);
    }
    // If the start link is below the end link. Makes a loop around the nodes.
    else if (startPos.y > endPos.y && startPos.y > endRect.top + endRect.height + this._drawStyle.links.length) {
      var x = startPos.x;
      var bottom = Math.max(startRect.top + startRect.height + coreRadius, endRect.top + endRect.height + coreRadius);
      var midy = (startPos.y + endPos.y) / 2;
      // Choose left or right.
      if (Math.abs(Math.min(startRect.left, endRect.left) - startPos.x) <= Math.abs(Math.max(startRect.left + startRect.width, endRect.left + endRect.width) - endPos.x)) {
        // Left
        x = Math.min(startRect.left - coreRadius, endRect.left - coreRadius);
        bottom -= 2;
      } else {
        // Right
        x = Math.max(startRect.left + startRect.width + coreRadius, endRect.left + endRect.width + coreRadius);
        bottom += 2;
      }
      var midx = (startPos.x + x) / 2;
      var radius = Math.min(coreRadius, Math.abs(x - startPos.x)/2, Math.abs(x - endPos.x)/2);

      context.arcTo(startPos.x, bottom, midx, bottom, radius);
      context.arcTo(x, bottom, x, midy, radius);
      context.arcTo(x, endPos.y - radius, midx, endPos.y - radius, radius);
      context.arcTo(endPos.x, endPos.y - radius, endPos.x, endPos.y, radius);
    }

    // Finish our line to the end position.
    context.lineTo(endPos.x, endPos.y);
    context.stroke();
    context.restore();
  },

  /**
   * Draws a connection chain between an input link and an output link of properties.
   * @function wcPlayEditor#__drawPropertyChain
   * @private
   * @param {wcPlay~Coordinates} startPos - The start position (the exit link).
   * @param {wcPlay~Coordinates} endPos - The end position (the entry link).
   * @param {wcPlayEditor~Rect} startRect - The start node's bounding rect to avoid.
   * @param {wcPlayEditor~Rect} endPos - The end node's bounding rect to avoid.
   * @param {Boolean} [flash] - If true, will flash the link.
   * @param {external:Canvas~Context} context - The canvas context.
   */
  __drawPropertyChain: function(startPos, endPos, startRect, endRect, context, flash, highlight) {
    context.save();
    context.strokeStyle = (highlight? 'cyan': (flash? '#AAFF33': '#33CC33'));
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(startPos.x, startPos.y);

    var coreRadius = 25;

    // If the output link is to the right the input link
    if (startPos.x < endPos.x) {
      var midx = (endPos.x + startPos.x) / 2;
      var midy = (endPos.y + startPos.y) / 2;
      var radius = Math.min(coreRadius, Math.abs(endPos.x - startPos.x)/2, Math.abs(endPos.y - startPos.y)/2);
      context.arcTo(midx, startPos.y, midx, midy, radius);
      context.arcTo(midx, endPos.y, endPos.x, endPos.y, radius);
    }
    // If the start rect is below the end rect.
    else if (startRect.top + startRect.height < endRect.top) {
      var midx = (endPos.x + startPos.x) / 2;
      var midy = (endRect.top + startRect.top + startRect.height) / 2 - 2;
      var topy = (midy + startPos.y) / 2;
      var bottomy = (endPos.y + midy) / 2;
      var radius = Math.min(coreRadius, Math.abs(endPos.x - startPos.x)/4, Math.abs(midy - topy), Math.abs(midy - bottomy));
      context.arcTo(startPos.x + radius, startPos.y, startPos.x + radius, topy, radius);
      context.arcTo(startPos.x + radius, midy, midx, midy, radius);
      context.arcTo(endPos.x - radius, midy, endPos.x - radius, bottomy, radius);
      context.arcTo(endPos.x - radius, endPos.y, endPos.x, endPos.y, radius);
    }
    // If the start rect above the end rect.
    else if (startRect.top > endRect.top + endRect.height) {
      var midx = (endPos.x + startPos.x) / 2;
      var midy = (startRect.top + endRect.top + endRect.height) / 2 + 2;
      var topy = (midy + endPos.y) / 2;
      var bottomy = (startPos.y + midy) / 2;
      var radius = Math.min(coreRadius, Math.abs(endPos.x - startPos.x)/4, Math.abs(midy - topy), Math.abs(midy - bottomy));
      context.arcTo(startPos.x + radius, startPos.y, startPos.x + radius, bottomy, radius);
      context.arcTo(startPos.x + radius, midy, midx, midy, radius);
      context.arcTo(endPos.x - radius, midy, endPos.x - radius, topy, radius);
      context.arcTo(endPos.x - radius, endPos.y, endPos.x, endPos.y, radius);
    }
    // If the start link is to the right of the end link.
    else if (startPos.x > endPos.x && startPos.x > endRect.left + endRect.width + this._drawStyle.links.length) {
      var y = startPos.y;
      var right = Math.max(startRect.left + startRect.width + coreRadius, endRect.left + endRect.width + coreRadius);
      var midx = (startPos.x + endPos.x) / 2;
      // Choose top or bottom.
      if (Math.abs(Math.min(startRect.top, endRect.top) - startPos.y) <= Math.abs(Math.max(startRect.top + startRect.height, endRect.top + endRect.height) - endPos.y)) {
        // Top
        y = Math.min(startRect.top - coreRadius, endRect.top - coreRadius);
        right -= 2;
      } else {
        // Bottom
        y = Math.max(startRect.top + startRect.height + coreRadius, endRect.top + endRect.height + coreRadius);
        right += 2;
      }
      var midy = (startPos.y + y) / 2;
      var radius = Math.min(coreRadius, Math.abs(y - startPos.y)/2, Math.abs(y - endPos.y)/2);

      context.arcTo(right, startPos.y, right, midy, radius);
      context.arcTo(right, y, midx, y, radius);
      context.arcTo(endPos.x - radius, y, endPos.x - radius, midy, radius);
      context.arcTo(endPos.x - radius, endPos.y, endPos.x, endPos.y, radius);
    }

    context.lineTo(endPos.x, endPos.y);
    context.stroke();
    context.restore();
  },

  /**
   * Draws the editor control for a property.
   * @function wcPlayEditor#__drawPropertyEditor
   * @private
   * @param {wcNode} node - The node to draw for.
   * @param {Object} property - The property data.
   * @param {wcPlayEditor~BoundingData} bounds - The bounding data for this property.
   * @param {Boolean} [initial] - Set true if the property being changed is the initial value.
   */
  __drawPropertyEditor: function(node, property, bounds, initial) {
    var $control = null;
    var cancelled = false;
    var enterConfirms = true;
    var propFn = (initial? 'initialProperty': 'property');

    var type = property.type;
    if (type === wcPlay.PROPERTY_TYPE.DYNAMIC) {
      var value = node.property(property.name);
      if (typeof value === 'string') {
        type = wcPlay.PROPERTY_TYPE.STRING;
      } else if (typeof value === 'bool') {
        type = wcPlay.PROPERTY_TYPE.TOGGLE;
      } else if (typeof value === 'number') {
        type = wcPlay.PROPERTY_TYPE.NUMBER;
      }
    }

    var self = this;
    function undoChange(node, name, oldValue, newValue) {
      self._undoManager && self._undoManager.addEvent('Property "' + name + '" changed for Node "' + node.category + '.' + node.type + '"',
      {
        id: node.id,
        name: name,
        propFn: propFn,
        oldValue: oldValue,
        newValue: newValue,
        editor: self,
      },
      // Undo
      function() {
        var myNode = this.editor._engine.nodeById(this.id);
        myNode[this.propFn](this.name, this.oldValue);
      },
      // Redo
      function() {
        var myNode = this.editor._engine.nodeById(this.id);
        myNode[this.propFn](this.name, this.newValue);
      });
    };

    // Determine what editor to use for the property.
    switch (type) {
      case wcPlay.PROPERTY_TYPE.TOGGLE:
        // Toggles do not show an editor, instead, they just toggle their state.
        var state = node[propFn](property.name);
        undoChange(node, property.name, state, !state);
        node[propFn](property.name, !state);
        break;
      case wcPlay.PROPERTY_TYPE.NUMBER:
        $control = $('<input type="number"' + (property.options.min? ' min="' + property.options.min + '"': '') + (property.options.max? ' max="' + property.options.max + '"': '') + (property.options.step? ' step="' + property.options.step + '"': '') + '>');
        $control.val(parseFloat(node[propFn](property.name)));
        $control.change(function() {
          if (!cancelled) {
            undoChange(node, property.name, node[propFn](property.name), $control.val());
            node[propFn](property.name, $control.val());
          }
        });
        break;
      case wcPlay.PROPERTY_TYPE.STRING:
        if (property.options.multiline) {
          $control = $('<textarea' + (property.options.maxlength? ' maxlength="' + property.options.maxlength + '"': '') + '>');
          enterConfirms = false;
        } else {
          $control = $('<input type="text" maxlength="' + (property.options.maxlength || 524288) + '">');
        }
        $control.val(node[propFn](property.name).toString());
        $control.change(function() {
          if (!cancelled) {
            undoChange(node, property.name, node[propFn](property.name), $control.val());
            node[propFn](property.name, $control.val());
          }
        });
        break;
      case wcPlay.PROPERTY_TYPE.SELECT:
        break;
    }

    if ($control) {
      var offset = {
        top: 0,
        left: this.$palette.width(),
      };

      this.$main.append($control);

      $control.addClass('wcPlayEditorControl');
      $control.focus();
      $control.select();

      // Clicking away will close the editor control.
      $control.blur(function() {
        $(this).remove();
      });

      $control.keyup(function(event) {
        switch (event.keyCode) {
          case 13: // Enter to confirm.
            if (enterConfirms || event.ctrlKey) {
              $control.blur();
            }
            break;
          case 27: // Escape to cancel.
            cancelled = true;
            $control.blur();
            break;
        }
        return false;
      });

      $control.css('top', offset.top + bounds.rect.top * this._viewportCamera.z + this._viewportCamera.y)
        .css('left', offset.left + bounds.rect.left * this._viewportCamera.z + this._viewportCamera.x)
        .css('width', 200)
        .css('height', Math.max(bounds.rect.height * this._viewportCamera.z * 0.9, 15));
    }
  },

  /**
   * Initializes user control.
   * @funciton wcPlayEditor#__setupControls
   * @private
   */
  __setupControls: function() {
    var self = this;

    // Menu
    // Setup events.
    $('ul.wcPlayEditorMenu > li').on('mouseenter', this.__onMenuMouseEnter);
    $('ul.wcPlayEditorMenu > li > ul').on('click', this.__onMenuClicked);
    $('ul.wcPlayEditorMenu > li').on('mouseleave', this.__onMenuMouseLeave);
    $('ul.wcPlayEditorMenu > li > ul').on('mouseleave', this.__onSubMenuMouseLeave);
    this.__bindMenuHandlers();

    // Palette
    this.$palette.on('mousemove',  function(event){self.__onPaletteMouseMove(event, this);});
    this.$palette.on('mousedown',  function(event){self.__onPaletteMouseDown(event, this);});
    this.$palette.on('mouseup',  function(event){self.__onPaletteMouseUp(event, this);});

    // Viewport
    this.$viewport.on('mousemove',  function(event){self.__onViewportMouseMove(event, this);});
    this.$viewport.on('mousedown',  function(event){self.__onViewportMouseDown(event, this);});
    this.$viewport.on('click',      function(event){self.__onViewportMouseClick(event, this);});
    this.$viewport.on('dblclick',   function(event){self.__onViewportMouseDoubleClick(event, this);});
    this.$viewport.on('mouseup',    function(event){self.__onViewportMouseUp(event, this);});
    // this.$viewport.on('mouseleave', function(event){self.__onViewportMouseUp(event, this);});
    this.$viewport.on('mousewheel DOMMouseScroll', function(event) {self.__onViewportMouseWheel(event, this);});

    $('body').keyup(function(event) {self.__onKey(event, this);});
  },

  /**
   * Handle key press events.
   * @function wcPlayEditor#__onKey
   * @private
   * @param {Object} event - The mouse event.
   * @param {Object} elem - The target element.
   */
  __onKey: function(event, elem) {
    switch (event.keyCode) {
      case 46: // Delete key to delete selected nodes.
        $('.wcPlayEditorMenuOptionDelete').click();
        break;
      case 'Z'.charCodeAt(0): // Ctrl+Z to undo last action.
        if (event.ctrlKey && !event.shiftKey) {
          $('.wcPlayEditorMenuOptionUndo').click();
        }
        if (!event.shiftKey) {
          break;
        }
      case 'Y'.charCodeAt(0): // Ctrl+Shift+Z or Ctrl+Y to redo action.
        if (event.ctrlKey) {
          $('.wcPlayEditorMenuOptionRedo').click();
        }
        break;
      case 32: // Space to step
        $('.wcPlayEditorMenuOptionStep').click();
        break;
      case 13: // Enter to continue;
        $('.wcPlayEditorMenuOptionPausePlay').click();
        break;
    }
  },

  /**
   * Mouse over an menu option on the top bar to open it.
   * @function wcPlayEditor#__onMenuMouseEnter
   * @private
   * @param {Object} event - The mouse event.
   */
  __onMenuMouseEnter: function(event) {
    var $self = $(this);
    setTimeout(function() {
      if ($self.is(':hover')) {
        $self.addClass('wcPlayEditorMenuOpen').addClass('wcMenuItemHover');
      }
    }, 100);
  },

  /**
   * Clicking a menu item will also hide that menu.
   * @function wcPlayEditor#__onMenuClicked
   * @private
   * @param {Object} event - The mouse event.
   */
  __onMenuClicked: function() {
    // Clicking a menu item will also hide that menu.
    $('ul.wcPlayEditorMenu li ul').css('display', 'none');
    setTimeout(function() {
      $('ul.wcPlayEditorMenu li ul').css('display', '');
    }, 200);
  },

  /**
   * Leaving the popup menu will hide it.
   * @function wcPlayEditor#__onMenuMouseLeave
   * @private
   * @param {Object} event - The mouse event.
   */
  __onMenuMouseLeave: function(event) {
    if ($(this).find(event.toElement).length === 0) {
      $(this).removeClass('wcPlayEditorMenuOpen').removeClass('wcMenuItemHover');
    }
  },

  /**
   * Moving your mouse cursor away from the drop down menu will also hide it.
   * @function wcPlayEditor#__onSubMenuMouseLeave
   * @private
   * @param {Object} event - The mouse event.
   */
  __onSubMenuMouseLeave: function(event) {
    // Make sure that we are actually leaving the menu
    // and not just jumping to another item in the menu
    $parent = $(this).parent();
    if ($parent.find(event.toElement).length === 0) {
      $parent.removeClass('wcPlayEditorMenuOpen').removeClass('wcMenuItemHover');
    }
  },

  /**
   * Binds click event handlers to each of the options in the menu and toolbar.
   * @function wcPlayEditor#__bindMenuHandlers
   * @private
   */
  __bindMenuHandlers: function() {
    var self = this;

    var $body = $('body');

    // Catch any disabled menu clicks and stop them from executing.
    $body.on('click', '.wcPlayMenuItem.disabled', function(event) {
      event.stopPropagation();
      event.preventDefault();
      return false;
    });

    // File menu
    $body.on('click', '.wcPlayEditorMenuOptionNew', function() {
      if (self._engine) {
        self._engine.clear();
      }
    });
    $body.on('click', '.wcPlayEditorMenuOptionOpen', function() {
      // TODO:
    });
    $body.on('click', '.wcPlayEditorMenuOptionSave', function() {
      // TODO:
    });

    // Edit menu
    $body.on('click', '.wcPlayEditorMenuOptionUndo', function() {
      self._undoManager && self._undoManager.undo();
    });
    $body.on('click', '.wcPlayEditorMenuOptionRedo', function() {
      self._undoManager && self._undoManager.redo();
    });

    $body.on('click', '.wcPlayEditorMenuOptionDelete', function() {
      if (self._selectedNodes.length) {
        self._undoManager && self._undoManager.beginGroup('Removed Nodes');
        for (var i = 0; i < self._selectedNodes.length; ++i) {
          var node = self._selectedNodes[i];

          self._undoManager && self._undoManager.addEvent('',
          {
            id: node.id,
            className: node.className,
            pos: {
              x: node.pos.x,
              y: node.pos.y,
            },
            collapsed: node.collapsed(),
            breakpoint: node._break,
            properties: node.listProperties(),
            entryChains: node.listEntryChains(),
            exitChains: node.listExitChains(),
            inputChains: node.listInputChains(),
            outputChains: node.listOutputChains(),
            editor: self,
          },
          // Undo
          function() {
            var myNode = new window[this.className](this.editor._engine, this.pos);
            myNode.id = this.id;
            myNode.collapsed(this.collapsed);
            myNode.debugBreak(this.breakpoint);
            // Restore property values.
            for (var i = 0; i < this.properties.length; ++i) {
              myNode.initialProperty(this.properties[i].name, this.properties[i].initialValue);
              myNode.property(this.properties[i].name, this.properties[i].value);
            }
            // Re-connect all chains.
            for (var i = 0; i < this.entryChains.length; ++i) {
              var chain = this.entryChains[i];
              var targetNode = this.editor._engine.nodeById(chain.outNodeId);
              myNode.connectEntry(chain.inName, targetNode, chain.outName);
            }
            for (var i = 0; i < this.exitChains.length; ++i) {
              var chain = this.exitChains[i];
              var targetNode = this.editor._engine.nodeById(chain.inNodeId);
              myNode.connectExit(chain.outName, targetNode, chain.inName);
            }
            for (var i = 0; i < this.inputChains.length; ++i) {
              var chain = this.inputChains[i];
              var targetNode = this.editor._engine.nodeById(chain.outNodeId);
              myNode.connectInput(chain.inName, targetNode, chain.outName);
            }
            for (var i = 0; i < this.outputChains.length; ++i) {
              var chain = this.outputChains[i];
              var targetNode = this.editor._engine.nodeById(chain.outNodeId);
              myNode.connectOutput(chain.inName, targetNode, chain.outName);
            }
          },
          // Redo
          function() {
            var myNode = this.editor._engine.nodeById(this.id);
            myNode.destroy();
          });

          node.destroy();
          node = null;
        }
        self._selectedNode = null;
        self._selectedNodes = [];
        self._undoManager && self._undoManager.endGroup();
      }
    });

    // Debugger
    $body.on('click', '.wcPlayEditorMenuOptionDebugging', function() {
      if (self._engine) {
        self._engine.debugging(!self._engine.debugging());
        self._engine.paused(false);
      }
    });
    $body.on('click', '.wcPlayEditorMenuOptionSilence', function() {
      if (self._engine) {
        self._engine.silent(!self._engine.silent());
      }
    });
    $body.on('click', '.wcPlayEditorMenuOptionRestart', function() {
      if (self._engine) {
        self._engine.start();
      }
    });
    $body.on('click', '.wcPlayEditorMenuOptionPausePlay', function() {
      if (self._engine) {
        if (self._engine.paused() || self._engine.stepping()) {
          self._engine.paused(false);
          self._engine.stepping(false);
        } else {
          self._engine.stepping(true);
        }
      }
    });
    $body.on('click', '.wcPlayEditorMenuOptionStep', function() {
      if (self._engine) {
        self._engine.paused(false);
        self._engine.stepping(true);
      }
    });

    // Help menu
    $body.on('click', '.wcPlayEditorMenuOptionDocs', function() {
      window.open('https://play.api.webcabin.org/', '_blank');
    });
    $body.on('click', '.wcPlayEditorMenuOptionAbout', function() {
      // TODO:
    });
  },

  /**
   * Handle mouse move events over the palette view.
   * @function wcPlayEditor#__onPaletteMouseMove
   * @private
   * @param {Object} event - The mouse event.
   * @param {Object} elem - The target element.
   */
  __onPaletteMouseMove: function(event, elem) {
    var mouse = this.__mouse(event);

    this._highlightCollapser = false;
    this._highlightBreakpoint = false;
    this._highlightEntryLink = false;
    this._highlightExitLink = false;
    this._highlightInputLink = false;
    this._highlightOutputLink = false;
    this._highlightPropertyValue = false;
    this._highlightPropertyInitialValue = false;

    // Dragging a node from the palette view.
    if (this._draggingNodeData) {
      var pos = {
        x: mouse.gx + this._draggingNodeData.offset.x,
        y: mouse.gy + this._draggingNodeData.offset.y,
      };

      this._draggingNodeData.$canvas.css('left', pos.x).css('top', pos.y);
      return;
    }

    var categoryData = this.__findCategoryAreaAtPos(mouse);
    if (categoryData) {
      var offset = categoryData.$canvas.offset();
      mouse = this.__mouse(event, offset);
      var node = this.__findNodeAtPos(mouse, undefined, categoryData.nodes);
      if (node) {
        this._highlightNode = node;
        this.$palette.addClass('wcClickable');
        this.$palette.attr('title', 'Create a new instance of this node by dragging this into your script.');
      } else {
        this._highlightNode = null;
        this.$palette.removeClass('wcClickable');
        this.$palette.attr('title', '');
      }
    }
  },

  /**
   * Handle mouse down events over the palette view.
   * @function wcPlayEditor#__onPaletteMouseDown
   * @private
   * @param {Object} event - The mouse event.
   * @param {Object} elem - The target element.
   */
  __onPaletteMouseDown: function(event, elem) {
    if (this._highlightNode) {
      this.__onPaletteMouseUp(event, elem);
      var mouse = this.__mouse(event);
      var rect = this._highlightNode._meta.bounds.rect;
      var categoryData = this.__findCategoryAreaAtPos(mouse);
      if (categoryData) {
        var offset = categoryData.$canvas.offset();

        this._draggingNodeData = {
          node: this._highlightNode,
          $canvas: $('<canvas class="wcPlayHoverCanvas">'),
          offset: {x: 0, y: 0}
        };
        this.$main.append(this._draggingNodeData.$canvas);

        this.$palette.addClass('wcMoving');
        this.$viewport.addClass('wcMoving');

        this._draggingNodeData.$canvas.css('left', rect.left + offset.left).css('top', rect.top + offset.top);
        this._draggingNodeData.$canvas.attr('width', rect.width).css('width', rect.width);
        this._draggingNodeData.$canvas.attr('height', rect.height).css('height', rect.height);

        this._draggingNodeData.offset.x = (rect.left + offset.left) - mouse.x;
        this._draggingNodeData.offset.y = (rect.top + offset.top) - mouse.y;

        var yPos = 0;
        if (!this._highlightNode.chain.entry.length) {
          yPos += this._drawStyle.links.length;
        }

        this.__drawNode(this._highlightNode, {x: rect.width/2, y: yPos}, this._draggingNodeData.$canvas[0].getContext('2d'), true);
      }
    }
  },

  /**
   * Handle mouse up events over the palette view.
   * @function wcPlayEditor#__onPaletteMouseDown
   * @private
   * @param {Object} event - The mouse event.
   * @param {Object} elem - The target element.
   */
  __onPaletteMouseUp: function(event, elem) {
    if (this._draggingNodeData) {
      this._draggingNodeData.$canvas.remove();
      this._draggingNodeData.$canvas = null;
      this._draggingNodeData = null;
      this.$palette.removeClass('wcMoving');
      this.$viewport.removeClass('wcMoving');
    }
  },

  /**
   * Handle mouse move events over the viewport canvas.
   * @function wcPlayEditor#__onViewportMouseMove
   * @private
   * @param {Object} event - The mouse event.
   * @param {Object} elem - The target element.
   */
  __onViewportMouseMove: function(event, elem) {
    var mouse = this.__mouse(event, this.$viewport.offset());
    if (mouse.x !== this._mouse.x || mouse.y !== this._mouse.y) {
      this._mouseMoved = true;
    }

    // Dragging a node from the palette view.
    if (this._draggingNodeData) {
      var pos = {
        x: mouse.gx + this._draggingNodeData.offset.x,
        y: mouse.gy + this._draggingNodeData.offset.y,
      };

      this._draggingNodeData.$canvas.css('left', pos.x).css('top', pos.y);
      return;
    }

    // Box selection.
    if (this._highlightRect && this._engine) {
      this._highlightRect.x = ((mouse.x - this._viewportCamera.x) / this._viewportCamera.z) - this._highlightRect.ox;
      this._highlightRect.y = ((mouse.y - this._viewportCamera.y) / this._viewportCamera.z) - this._highlightRect.oy;

      this._highlightRect.width = this._highlightRect.x;
      this._highlightRect.height = this._highlightRect.y;
      if (this._highlightRect.width < 0) {
        this._highlightRect.left = this._highlightRect.ox + this._highlightRect.width;
        this._highlightRect.width *= -1;
      }
      if (this._highlightRect.height < 0) {
        this._highlightRect.top = this._highlightRect.oy + this._highlightRect.height;
        this._highlightRect.height *= -1;
      }


      this._selectedNodes = [];
      var self = this;
      function __nodesInRect(nodes) {
        for (var i = 0; i < nodes.length; ++i) {
          if (self.__rectInRect(nodes[i]._meta.bounds.inner, self._highlightRect)) {
            self._selectedNodes.push(nodes[i]);
          }
        }
      };
      __nodesInRect(this._engine._storageNodes);
      __nodesInRect(this._engine._compositeNodes);
      __nodesInRect(this._engine._processNodes);
      __nodesInRect(this._engine._entryNodes);
      return;
    }

    // Viewport panning.
    if (this._viewportMoving) {
      var moveX = mouse.x - this._mouse.x;
      var moveY = mouse.y - this._mouse.y;
      this._viewportCamera.x += moveX;
      this._viewportCamera.y += moveY;
      this._mouse = mouse;
      if (!this._viewportMoved) {
        this._viewportMoved = true;
        this.$viewport.addClass('wcMoving');
      }
      return;
    }

    if (this._viewportMovingNode) {
      var moveX = mouse.x - this._mouse.x;
      var moveY = mouse.y - this._mouse.y;
      for (var i = 0; i < this._selectedNodes.length; ++i) {
        this._selectedNodes[i].pos.x += moveX / this._viewportCamera.z;
        this._selectedNodes[i].pos.y += moveY / this._viewportCamera.z;
      }
      this._mouse = mouse;
      return;
    }

    this._mouse = mouse;
    this._highlightCollapser = false;
    this._highlightBreakpoint = false;
    this._highlightEntryLink = false;
    this._highlightExitLink = false;
    this._highlightInputLink = false;
    this._highlightOutputLink = false;
    this._highlightPropertyValue = false;
    this._highlightPropertyInitialValue = false;

    var node = this.__findNodeAtPos(mouse, this._viewportCamera);
    if (node) {
      // Check for main node collision.
      if (this.__inRect(mouse, node._meta.bounds.inner, this._viewportCamera)) {
        this._highlightNode = node;
        this.$viewport.addClass('wcClickable');
        this.$viewport.attr('title', 'Click and drag to move this node. Double click to collapse/expand this node.');
      } else {
        this.$viewport.removeClass('wcClickable');
      }

      // Collapser button.
      if (!this._selectedEntryLink && !this._selectedExitLink && !this._selectedInputLink && !this._selectedOutputLink) {
        if (this.__inRect(mouse, node._meta.bounds.collapser, this._viewportCamera)) {
          this._highlightCollapser = true;
          if (node.collapsed()) {
            this.$viewport.attr('title', 'Expand this node.');
          } else {
            this.$viewport.attr('title', 'Collapse this node.');
          }
        }

        // Breakpoint button.
        if (this.__inRect(mouse, node._meta.bounds.breakpoint, this._viewportCamera)) {
          this._highlightBreakpoint = true;
          this.$viewport.attr('title', 'Toggle debug breakpoint on this node.');
        }
      }

      // Entry links.
      if (!this._selectedEntryLink && !this._selectedInputLink && !this._selectedOutputLink) {
        for (var i = 0; i < node._meta.bounds.entryBounds.length; ++i) {
          if (this.__inRect(mouse, node._meta.bounds.entryBounds[i].rect, this._viewportCamera)) {
            this._highlightNode = node;
            this._highlightEntryLink = node._meta.bounds.entryBounds[i];
            this.$viewport.attr('title', 'Click and drag to create a new flow chain to another node.');
            break;
          }
        }
      }

      // Exit links.
      if (!this._selectedExitLink && !this._selectedInputLink && !this._selectedOutputLink) {
        for (var i = 0; i < node._meta.bounds.exitBounds.length; ++i) {
          if (this.__inRect(mouse, node._meta.bounds.exitBounds[i].rect, this._viewportCamera)) {
            this._highlightNode = node;
            this._highlightExitLink = node._meta.bounds.exitBounds[i];
            this.$viewport.attr('title', 'Click and drag to create a new flow chain to another node. Double click to manually trigger chains attached to this link.');
            break;
          }
        }
      }

      // Input links.
      if (!this._selectedEntryLink && !this._selectedExitLink && !this._selectedInputLink) {
        for (var i = 0; i < node._meta.bounds.inputBounds.length; ++i) {
          if (this.__inRect(mouse, node._meta.bounds.inputBounds[i].rect, this._viewportCamera)) {
            this._highlightNode = node;
            this._highlightInputLink = node._meta.bounds.inputBounds[i];
            this.$viewport.attr('title', 'Click and drag to chain this property to another.');
            break;
          }
        }
      }

        // Output links.
      if (!this._selectedEntryLink && !this._selectedExitLink && !this._selectedOutputLink) {
        for (var i = 0; i < node._meta.bounds.outputBounds.length; ++i) {
          if (this.__inRect(mouse, node._meta.bounds.outputBounds[i].rect, this._viewportCamera)) {
            this._highlightNode = node;
            this._highlightOutputLink = node._meta.bounds.outputBounds[i];
            this.$viewport.attr('title', 'Click and drag to chain this property to another. Double click to manually propagate this property through the chain.');
            break;
          }
        }
      }

      // Property values.
      if (!this._selectedEntryLink && !this._selectedExitLink && !this._selectedInputLink && !this._selectedOutputLink) {
        var propBounds;
        for (var i = 0; i < node._meta.bounds.valueBounds.length; ++i) {
          if (this.__inRect(this._mouse, node._meta.bounds.valueBounds[i].rect, this._viewportCamera)) {
            propBounds = node._meta.bounds.valueBounds[i];
            break;
          }
        }

        if (propBounds) {
          for (var i = 0; i < node.properties.length; ++i) {
            if (node.properties[i].name === propBounds.name) {
              this._highlightNode = node;
              this._highlightPropertyValue = propBounds;
              this.$viewport.attr('title', 'Click to change the current value of this property.');
              break;
            }
          }
        }

        var propInitialBounds;
        for (var i = 0; i < node._meta.bounds.initialBounds.length; ++i) {
          if (this.__inRect(this._mouse, node._meta.bounds.initialBounds[i].rect, this._viewportCamera)) {
            propInitialBounds = node._meta.bounds.initialBounds[i];
            break;
          }
        }

        if (propInitialBounds) {
          for (var i = 0; i < node.properties.length; ++i) {
            if (node.properties[i].name === propInitialBounds.name) {
              this._highlightNode = node;
              this._highlightPropertyInitialValue = propInitialBounds;
              this.$viewport.attr('title', 'Click to change the initial value of this property.');
              break;
            }
          }
        }
      }
    } else {
      this._highlightNode = null;
      this.$viewport.attr('title', '');
      this.$viewport.removeClass('wcClickable');
    }

    // If you hover over a node that is not currently expanded by hovering, force the expanded node to collapse again.
    if (this._expandedNode && this._expandedNode !== this._highlightNode) {
      // If we are not highlighting a new node, only uncollapse the previously hovered node if we are far from it.
      if (this._highlightNode || !this.__inRect(mouse, this._expandedNode._meta.bounds.farRect, this._viewportCamera)) {
        // Recollapse our previous node, if necessary.
        if (this._expandedNodeWasCollapsed) {
          this._expandedNode.collapsed(true);
        }

        this._expandedNode = null;
      }
    }

    // If the user is creating a new connection and hovering over another node, uncollapse it temporarily to expose links.
    if (!this._expandedNode && this._highlightNode &&
        (this._selectedEntryLink || this._selectedExitLink ||
        this._selectedInputLink || this._selectedOutputLink) && 
        this.__inRect(mouse, node._meta.bounds.inner, this._viewportCamera)) {

      this._expandedNode = this._highlightNode;
      this._expandedNodeWasCollapsed = this._expandedNode.collapsed();
      this._expandedNode.collapsed(false);
    }
  },

  /**
   * Handle mouse press events over the viewport canvas.
   * @function wcPlayEditor#__onViewportMouseDown
   * @private
   * @param {Object} event - The mouse event.
   * @param {Object} elem - The target element.
   */
  __onViewportMouseDown: function(event, elem) {
    this._mouse = this.__mouse(event, this.$viewport.offset());
    this._mouseMoved = false;

    // Control+drag to box select.
    if (event.ctrlKey) {
      this._highlightRect = {
        top: (this._mouse.y - this._viewportCamera.y) / this._viewportCamera.z,
        left: (this._mouse.x - this._viewportCamera.x) / this._viewportCamera.z,
        oy: (this._mouse.y - this._viewportCamera.y) / this._viewportCamera.z,
        ox: (this._mouse.x - this._viewportCamera.x) / this._viewportCamera.z,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };
      return;
    }

    var hasTarget = false;
    var node = this.__findNodeAtPos(this._mouse, this._viewportCamera);
    if (node) {
      // Entry links.
      if (!hasTarget) {
        for (var i = 0; i < node._meta.bounds.entryBounds.length; ++i) {
          if (this.__inRect(this._mouse, node._meta.bounds.entryBounds[i].rect, this._viewportCamera)) {
            hasTarget = true;
            // Alt click to disconnect all chains from this link.
            if (event.altKey) {
              var chains = node.listEntryChains(node._meta.bounds.entryBounds[i].name);
              if (chains.length) {
                this._undoManager && this._undoManager.addEvent('Disconnected Entry Links for "' + node.category + '.' + node.type + '.' + node._meta.bounds.entryBounds[i].name + '"',
                  {
                    id: node.id,
                    name: node._meta.bounds.entryBounds[i].name,
                    chains: chains,
                    editor: this,
                  },
                  // Undo
                  function() {
                    var myNode = this.editor._engine.nodeById(this.id);
                    for (var i = 0; i < this.chains.length; ++i) {
                      var targetNode = this.editor._engine.nodeById(this.chains[i].outNodeId);
                      var targetName = this.chains[i].outName;
                      myNode.connectEntry(this.name, targetNode, targetName);
                    }
                  },
                  // Redo
                  function() {
                    var myNode = this.editor._engine.nodeById(this.id);
                    myNode.disconnectEntry(this.name);
                  });
              }
              node.disconnectEntry(node._meta.bounds.entryBounds[i].name);
              break;
            }
            this._selectedNode = node;
            this._selectedNodes = [node];
            this._selectedEntryLink = node._meta.bounds.entryBounds[i];
            break;
          }
        }
      }

      // Exit links.
      if (!hasTarget) {
        for (var i = 0; i < node._meta.bounds.exitBounds.length; ++i) {
          if (this.__inRect(this._mouse, node._meta.bounds.exitBounds[i].rect, this._viewportCamera)) {
            hasTarget = true;
            // Alt click to disconnect all chains from this link.
            if (event.altKey) {
              var chains = node.listExitChains(node._meta.bounds.exitBounds[i].name);
              if (chains.length) {
                this._undoManager && this._undoManager.addEvent('Disconnected Exit Links for "' + node.category + '.' + node.type + '.' + node._meta.bounds.exitBounds[i].name + '"',
                  {
                    id: node.id,
                    name: node._meta.bounds.exitBounds[i].name,
                    chains: chains,
                    editor: this,
                  },
                  // Undo
                  function() {
                    var myNode = this.editor._engine.nodeById(this.id);
                    for (var i = 0; i < this.chains.length; ++i) {
                      var targetNode = this.editor._engine.nodeById(this.chains[i].inNodeId);
                      var targetName = this.chains[i].inName;
                      myNode.connectExit(this.name, targetNode, targetName);
                    }
                  },
                  // Redo
                  function() {
                    var myNode = this.editor._engine.nodeById(this.id);
                    myNode.disconnectExit(this.name);
                  });
              }
              node.disconnectExit(node._meta.bounds.exitBounds[i].name);
              break;
            } 
            // Shift click to manually fire this exit chain.
            else if (event.shiftKey) {
              node.triggerExit(node._meta.bounds.exitBounds[i].name);
              break;
            }
            this._selectedNode = node;
            this._selectedNodes = [node];
            this._selectedExitLink = node._meta.bounds.exitBounds[i];
            break;
          }
        }
      }

      // Input links.
      if (!hasTarget) {
        for (var i = 0; i < node._meta.bounds.inputBounds.length; ++i) {
          if (this.__inRect(this._mouse, node._meta.bounds.inputBounds[i].rect, this._viewportCamera)) {
            hasTarget = true;
            // Alt click to disconnect all chains from this link.
            if (event.altKey) {
              var chains = node.listInputChains(node._meta.bounds.inputBounds[i].name);
              if (chains.length) {
                this._undoManager && this._undoManager.addEvent('Disconnected Property Input Links for "' + node.category + '.' + node.type + '.' + node._meta.bounds.inputBounds[i].name + '"',
                  {
                    id: node.id,
                    name: node._meta.bounds.inputBounds[i].name,
                    chains: chains,
                    editor: this,
                  },
                  // Undo
                  function() {
                    var myNode = this.editor._engine.nodeById(this.id);
                    for (var i = 0; i < this.chains.length; ++i) {
                      var targetNode = this.editor._engine.nodeById(this.chains[i].outNodeId);
                      var targetName = this.chains[i].outName;
                      myNode.connectInput(this.name, targetNode, targetName);
                    }
                  },
                  // Redo
                  function() {
                    var myNode = this.editor._engine.nodeById(this.id);
                    myNode.disconnectInput(this.name);
                  });
              }
              node.disconnectInput(node._meta.bounds.inputBounds[i].name);
              break;
            }
            this._selectedNode = node;
            this._selectedNodes = [node];
            this._selectedInputLink = node._meta.bounds.inputBounds[i];
            break;
          }
        }
      }

      // Output links.
      if (!hasTarget) {
        for (var i = 0; i < node._meta.bounds.outputBounds.length; ++i) {
          if (this.__inRect(this._mouse, node._meta.bounds.outputBounds[i].rect, this._viewportCamera)) {
            hasTarget = true;
            // Alt click to disconnect all chains from this link.
            if (event.altKey) {
              var chains = node.listOutputChains(node._meta.bounds.outputBounds[i].name);
              if (chains.length) {
                this._undoManager && this._undoManager.addEvent('Disconnected Property Output Links for "' + node.category + '.' + node.type + '.' + node._meta.bounds.outputBounds[i].name + '"',
                  {
                    id: node.id,
                    name: node._meta.bounds.outputBounds[i].name,
                    chains: chains,
                    editor: this,
                  },
                  // Undo
                  function() {
                    var myNode = this.editor._engine.nodeById(this.id);
                    for (var i = 0; i < this.chains.length; ++i) {
                      var targetNode = this.editor._engine.nodeById(this.chains[i].inNodeId);
                      var targetName = this.chains[i].inName;
                      myNode.connectOutput(this.name, targetNode, targetName);
                    }
                  },
                  // Redo
                  function() {
                    var myNode = this.editor._engine.nodeById(this.id);
                    myNode.disconnectOutput(this.name);
                  });
              }
              node.disconnectOutput(node._meta.bounds.outputBounds[i].name);
              break;
            }
            this._selectedNode = node;
            this._selectedNodes = [node];
            this._selectedOutputLink = node._meta.bounds.outputBounds[i];
            break;
          }
        }
      }

      // Center area.
      if (!hasTarget && this.__inRect(this._mouse, node._meta.bounds.inner, this._viewportCamera)) {
        hasTarget = true;
        if (!this._selectedNodes.length || this._selectedNodes.indexOf(node) === -1) {
          this._selectedNode = node;
          this._selectedNodes = [node];
        }
        this._viewportMovingNode = true;
        this._selectedNodeOrigins = [];
        for (var i = 0; i < this._selectedNodes.length; ++i) {
          var myNode = this._selectedNodes[i];
          this._selectedNodeOrigins.push({
            x: myNode.pos.x,
            y: myNode.pos.y,
          });
        }
      }
    }

    // Click outside of a node begins the canvas drag process.
    if (!hasTarget) {
      this._viewportMoving = true;
      this._viewportMoved = false;
    }
  },

  /**
   * Handle mouse click events over the viewport canvas.
   * @function wcPlayEditor#__onViewportMouseDown
   * @private
   * @param {Object} event - The mouse event.
   * @param {Object} elem - The target element.
   */
  __onViewportMouseClick: function(event, elem) {
    if (!this._mouseMoved) {
      this._mouse = this.__mouse(event, this.$viewport.offset());

      var hasTarget = false;
      var node = this.__findNodeAtPos(this._mouse, this._viewportCamera);
      if (node) {
        // Collapser button.
        if (this.__inRect(this._mouse, node._meta.bounds.collapser, this._viewportCamera)) {
          var state = !node.collapsed();
          node.collapsed(state);
          this._undoManager && this._undoManager.addEvent((state? 'Collapsed': 'Expanded') + ' Node "' + node.category + '.' + node.type + '"',
          {
            id: node.id,
            state: state,
            editor: this,
          },
          // Undo
          function() {
            var myNode = this.editor._engine.nodeById(this.id);
            myNode.collapsed(!this.state);
          },
          // Redo
          function() {
            var myNode = this.editor._engine.nodeById(this.id);
            myNode.collapsed(this.state);
          });
        }

        // Breakpoint button.
        if (this.__inRect(this._mouse, node._meta.bounds.breakpoint, this._viewportCamera)) {
          var state = !node._break;
          node.debugBreak(state);
          this._undoManager && this._undoManager.addEvent((state? 'Enabled': 'Disabled') + ' Breakpoint on Node "' + node.category + '.' + node.type + '"',
          {
            id: node.id,
            state: state,
            editor: this,
          },
          // Undo
          function() {
            var myNode = this.editor._engine.nodeById(this.id);
            myNode.debugBreak(!this.state);
          },
          // Redo
          function() {
            var myNode = this.editor._engine.nodeById(this.id);
            myNode.debugBreak(this.state);
          });
        }

        // Property values.
        var propBounds;
        for (var i = 0; i < node._meta.bounds.valueBounds.length; ++i) {
          if (this.__inRect(this._mouse, node._meta.bounds.valueBounds[i].rect, this._viewportCamera)) {
            propBounds = node._meta.bounds.valueBounds[i];
            break;
          }
        }

        if (propBounds) {
          for (var i = 0; i < node.properties.length; ++i) {
            if (node.properties[i].name === propBounds.name) {
              this.__drawPropertyEditor(node, node.properties[i], propBounds);
              break;
            }
          }
        }

        var propInitialBounds;
        for (var i = 0; i < node._meta.bounds.initialBounds.length; ++i) {
          if (this.__inRect(this._mouse, node._meta.bounds.initialBounds[i].rect, this._viewportCamera)) {
            propInitialBounds = node._meta.bounds.initialBounds[i];
            break;
          }
        }

        if (propInitialBounds) {
          for (var i = 0; i < node.properties.length; ++i) {
            if (node.properties[i].name === propInitialBounds.name) {
              this.__drawPropertyEditor(node, node.properties[i], propInitialBounds, true);
              break;
            }
          }
        }
      }
    }
  },

  /**
   * Handle mouse double click events over the viewport canvas.
   * @function wcPlayEditor#__onViewportMouseDoubleClick
   * @private
   * @param {Object} event - The mouse event.
   * @param {Object} elem - The target element.
   */
  __onViewportMouseDoubleClick: function(event, elem) {
    this._mouse = this.__mouse(event, this.$viewport.offset());

    var hasTarget = false;
    var node = this.__findNodeAtPos(this._mouse, this._viewportCamera);
    if (node) {
      // Collapser button.
      if (this.__inRect(this._mouse, node._meta.bounds.collapser, this._viewportCamera)) {
        hasTarget = true;
      }

      // Breakpoint button.
      if (this.__inRect(this._mouse, node._meta.bounds.breakpoint, this._viewportCamera)) {
        hasTarget = true;
      }

      // Property values.
      for (var i = 0; i < node._meta.bounds.valueBounds.length; ++i) {
        if (this.__inRect(this._mouse, node._meta.bounds.valueBounds[i].rect, this._viewportCamera)) {
          hasTarget = true;
          break;
        }
      }

      // Exit links.
      if (!hasTarget) {
        for (var i = 0; i < node._meta.bounds.exitBounds.length; ++i) {
          if (this.__inRect(this._mouse, node._meta.bounds.exitBounds[i].rect, this._viewportCamera)) {
            hasTarget = true;
            // Double click to manually fire this exit chain.
            node.triggerExit(node._meta.bounds.exitBounds[i].name);
            break;
          }
        }
      }

      // Output links.
      if (!hasTarget) {
        for (var i = 0; i < node._meta.bounds.outputBounds.length; ++i) {
          if (this.__inRect(this._mouse, node._meta.bounds.outputBounds[i].rect, this._viewportCamera)) {
            hasTarget = true;
            // Double click to manually fire this output chain.
            node.property(node._meta.bounds.outputBounds[i].name, node.property(node._meta.bounds.outputBounds[i].name), true);
            break;
          }
        }
      }

      // Center area.
      if (!hasTarget && this.__inRect(this._mouse, node._meta.bounds.inner, this._viewportCamera)) {
        hasTarget = true;
        node.collapsed(!node.collapsed());
      }
    }
  },

  /**
   * Handle mouse release events over the viewport canvas.
   * @function wcPlayEditor#__onViewportMouseDown
   * @private
   * @param {Object} event - The mouse event.
   * @param {Object} elem - The target element.
   */
  __onViewportMouseUp: function(event, elem) {
    if (this._draggingNodeData) {
      // Create an instance of the node and add it to the script.
      var mouse = this.__mouse(event, this.$viewport.offset(), this._viewportCamera);
      var newNode = new window[this._draggingNodeData.node.className](this._engine, {
        x: (mouse.x + (this._draggingNodeData.$canvas.width()/2 + this._draggingNodeData.offset.x)) / this._viewportCamera.z,
        y: (mouse.y + this._draggingNodeData.offset.y) / this._viewportCamera.z,
      });

      this._undoManager && this._undoManager.addEvent('Created Node "' + newNode.category + '.' + newNode.type + '"',
      {
        id: newNode.id,
        className: newNode.className,
        pos: {
          x: newNode.pos.x,
          y: newNode.pos.y,
        },
        editor: this,
      },
      // Undo
      function() {
        var myNode = this.editor._engine.nodeById(this.id);
        myNode.destroy();
      },
      // Redo
      function() {
        var myNode = new window[this.className](this.editor._engine, this.pos);
        myNode.id = this.id;
      });

      this._selectedNode = newNode;
      this._selectedNodes = [newNode];

      this._draggingNodeData.$canvas.remove();
      this._draggingNodeData.$canvas = null;
      this._draggingNodeData = null;
      this.$palette.removeClass('wcMoving');
      this.$viewport.removeClass('wcMoving');
    }

    if (this._highlightRect && this._engine) {
      this._highlightRect = null;
      return;
    }

    // Finished moving a node.
    if (this._selectedNodes.length && this._selectedNodeOrigins.length) {
      for (var i = 0; i < this._selectedNodes.length; ++i) {
        var node = this._selectedNodes[i];
        if (node.pos.x !== this._selectedNodeOrigins[i].x || node.pos.y !== this._selectedNodeOrigins[i].y) {
          this._undoManager && this._undoManager.addEvent('Moved Node "' + node.category + '.' + node.type + '"',
          {
            id: node.id,
            start: {
              x: this._selectedNodeOrigins[i].x,
              y: this._selectedNodeOrigins[i].y,
            },
            end: {
              x: node.pos.x,
              y: node.pos.y,
            },
            editor: this,
          },
          // Undo
          function() {
            var myNode = this.editor._engine.nodeById(this.id);
            myNode.pos.x = this.start.x;
            myNode.pos.y = this.start.y;
          },
          // Redo
          function() {
            var myNode = this.editor._engine.nodeById(this.id);
            myNode.pos.x = this.end.x;
            myNode.pos.y = this.end.y;
          });
        }
      }
      this._selectedNodeOrigins = [];
    }

    // Check for link connections.
    if (this._selectedNode && this._selectedEntryLink && this._highlightNode && this._highlightExitLink) {
      if (this._selectedNode.connectEntry(this._selectedEntryLink.name, this._highlightNode, this._highlightExitLink.name) === wcNode.CONNECT_RESULT.ALREADY_CONNECTED) {
        this._selectedNode.disconnectEntry(this._selectedEntryLink.name, this._highlightNode, this._highlightExitLink.name);
        this._undoManager && this._undoManager.addEvent('Disconnected Entry Link "' + this._selectedNode.category + '.' + this._selectedNode.type + '.' + this._selectedEntryLink.name + '" to Exit Link "' + this._highlightNode.category + '.' + this._highlightNode.type + '.' + this._highlightExitLink.name + '"',
        {
          id: this._selectedNode.id,
          name: this._selectedEntryLink.name,
          targetId: this._highlightNode.id,
          targetName: this._highlightExitLink.name,
          editor: this,
        },
        // Undo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.connectEntry(this.name, targetNode, this.targetName);
        },
        // Redo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.disconnectEntry(this.name, targetNode, this.targetName);
        });
      } else {
        this._undoManager && this._undoManager.addEvent('Connected Entry Link "' + this._selectedNode.category + '.' + this._selectedNode.type + '.' + this._selectedEntryLink.name + '" to Exit Link "' + this._highlightNode.category + '.' + this._highlightNode.type + '.' + this._highlightExitLink.name + '"',
        {
          id: this._selectedNode.id,
          name: this._selectedEntryLink.name,
          targetId: this._highlightNode.id,
          targetName: this._highlightExitLink.name,
          editor: this,
        },
        // Undo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.disconnectEntry(this.name, targetNode, this.targetName);
        },
        // Redo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.connectEntry(this.name, targetNode, this.targetName);
        });
      }
    }
    if (this._selectedNode && this._selectedExitLink && this._highlightNode && this._highlightEntryLink) {
      if (this._selectedNode.connectExit(this._selectedExitLink.name, this._highlightNode, this._highlightEntryLink.name) === wcNode.CONNECT_RESULT.ALREADY_CONNECTED) {
        this._selectedNode.disconnectExit(this._selectedExitLink.name, this._highlightNode, this._highlightEntryLink.name);
        this._undoManager && this._undoManager.addEvent('Disconnected Exit Link "' + this._selectedNode.category + '.' + this._selectedNode.type + '.' + this._selectedExitLink.name + '" to Entry Link "' + this._highlightNode.category + '.' + this._highlightNode.type + '.' + this._highlightEntryLink.name + '"',
        {
          id: this._selectedNode.id,
          name: this._selectedExitLink.name,
          targetId: this._highlightNode.id,
          targetName: this._highlightEntryLink.name,
          editor: this,
        },
        // Undo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.connectExit(this.name, targetNode, this.targetName);
        },
        // Redo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.disconnectExit(this.name, targetNode, this.targetName);
        });
      } else {
        this._undoManager && this._undoManager.addEvent('Connected Exit Link "' + this._selectedNode.category + '.' + this._selectedNode.type + '.' + this._selectedExitLink.name + '" to Entry Link "' + this._highlightNode.category + '.' + this._highlightNode.type + '.' + this._highlightEntryLink.name + '"',
        {
          id: this._selectedNode.id,
          name: this._selectedExitLink.name,
          targetId: this._highlightNode.id,
          targetName: this._highlightEntryLink.name,
          editor: this,
        },
        // Undo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.disconnectExit(this.name, targetNode, this.targetName);
        },
        // Redo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.connectExit(this.name, targetNode, this.targetName);
        });
      }
    }
    if (this._selectedNode && this._selectedInputLink && this._highlightNode && this._highlightOutputLink) {
      if (this._selectedNode.connectInput(this._selectedInputLink.name, this._highlightNode, this._highlightOutputLink.name) === wcNode.CONNECT_RESULT.ALREADY_CONNECTED) {
        this._selectedNode.disconnectInput(this._selectedInputLink.name, this._highlightNode, this._highlightOutputLink.name);
        this._undoManager && this._undoManager.addEvent('Disconnected Property Input Link "' + this._selectedNode.category + '.' + this._selectedNode.type + '.' + this._selectedInputLink.name + '" to Property Output Link "' + this._highlightNode.category + '.' + this._highlightNode.type + '.' + this._highlightOutputLink.name + '"',
        {
          id: this._selectedNode.id,
          name: this._selectedInputLink.name,
          targetId: this._highlightNode.id,
          targetName: this._highlightOutputLink.name,
          editor: this,
        },
        // Undo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.connectInput(this.name, targetNode, this.targetName);
        },
        // Redo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.disconnectInput(this.name, targetNode, this.targetName);
        });
      } else {
        this._undoManager && this._undoManager.addEvent('Connected Property Input Link "' + this._selectedNode.category + '.' + this._selectedNode.type + '.' + this._selectedInputLink.name + '" to Property Output Link "' + this._highlightNode.category + '.' + this._highlightNode.type + '.' + this._highlightOutputLink.name + '"',
        {
          id: this._selectedNode.id,
          name: this._selectedInputLink.name,
          targetId: this._highlightNode.id,
          targetName: this._highlightOutputLink.name,
          editor: this,
        },
        // Undo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.disconnectInput(this.name, targetNode, this.targetName);
        },
        // Redo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.connectInput(this.name, targetNode, this.targetName);
        });
      }
    }
    if (this._selectedNode && this._selectedOutputLink && this._highlightNode && this._highlightInputLink) {
      if (this._selectedNode.connectOutput(this._selectedOutputLink.name, this._highlightNode, this._highlightInputLink.name) === wcNode.CONNECT_RESULT.ALREADY_CONNECTED) {
        this._selectedNode.disconnectOutput(this._selectedOutputLink.name, this._highlightNode, this._highlightInputLink.name);
        this._undoManager && this._undoManager.addEvent('Disconnected Property Output Link "' + this._selectedNode.category + '.' + this._selectedNode.type + '.' + this._selectedOutputLink.name + '" to Property Input Link "' + this._highlightNode.category + '.' + this._highlightNode.type + '.' + this._highlightInputLink.name + '"',
        {
          id: this._selectedNode.id,
          name: this._selectedOutputLink.name,
          targetId: this._highlightNode.id,
          targetName: this._highlightInputLink.name,
          editor: this,
        },
        // Undo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.connectOutput(this.name, targetNode, this.targetName);
        },
        // Redo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.disconnectOutput(this.name, targetNode, this.targetName);
        });
      } else {
        this._undoManager && this._undoManager.addEvent('Connected Property Output Link "' + this._selectedNode.category + '.' + this._selectedNode.type + '.' + this._selectedOutputLink.name + '" to Property Input Link "' + this._highlightNode.category + '.' + this._highlightNode.type + '.' + this._highlightInputLink.name + '"',
        {
          id: this._selectedNode.id,
          name: this._selectedOutputLink.name,
          targetId: this._highlightNode.id,
          targetName: this._highlightInputLink.name,
          editor: this,
        },
        // Undo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.disconnectOutput(this.name, targetNode, this.targetName);
        },
        // Redo
        function() {
          var myNode = this.editor._engine.nodeById(this.id);
          var targetNode = this.editor._engine.nodeById(this.targetId);
          myNode.connectOutput(this.name, targetNode, this.targetName);
        });
      }
    }

    // Re-collapse the node, if necessary.
    if (this._expandedNode && this._expandedNodeWasCollapsed) {
      this._expandedNode.collapsed(true);
    }

    this._expandedNode = null;
    this._selectedEntryLink = false;
    this._selectedExitLink = false;
    this._selectedInputLink = false;
    this._selectedOutputLink = false;
    this._viewportMovingNode = false;

    if (this._viewportMoving) {
      this._viewportMoving = false;

      if (!this._viewportMoved) {
        this._selectedNode = null;
        this._selectedNodes = [];
      } else {
        this._viewportMoved = false;
        this.$viewport.removeClass('wcMoving');
      }
    }
  },

  __onViewportMouseWheel: function(event, elem) {
    var oldZoom = this._viewportCamera.z;
    var mouse = this.__mouse(event, this.$viewport.offset());

    if (event.originalEvent.wheelDelta > 0 || event.originalEvent.detail < 0) {
      // scroll up to zoom in.
      this._viewportCamera.z = Math.min(this._viewportCamera.z * 1.25, 5);
    } else {
      // scroll down to zoom out.
      this._viewportCamera.z = Math.max(this._viewportCamera.z * 0.75, 0.1);
    }

    this._viewportCamera.x = (this._viewportCamera.x - mouse.x) / (oldZoom / this._viewportCamera.z) + mouse.x;
    this._viewportCamera.y = (this._viewportCamera.y - mouse.y) / (oldZoom / this._viewportCamera.z) + mouse.y;
  },

  /**
   * Does a bounding collision test to find any nodes at a given position.
   * @function wcPlayEditor#__findNodeAtPos
   * @private
   * @param {wcPlay~Coordinates} pos - The position.
   * @param {wcPlay~Coordinates} camera - The position of the camera.
   * @param {wcNode[]} [nodes] - If supplied, will only search this list of nodes, otherwise will search all nodes in the viewport.
   * @returns {wcNode|null} - A node at the given position, or null if none was found.
   */
  __findNodeAtPos: function(pos, camera, nodes) {
    if (this._engine) {
      var self = this;
      function __test(nodes) {
        // Iterate backwards so we always test the nodes that are drawn on top first.
        for (var i = nodes.length-1; i >= 0; --i) {
          if (nodes[i]._meta.bounds && self.__inRect(pos, nodes[i]._meta.bounds.rect, camera)) {
            return nodes[i];
          }
        }
        return null;
      };

      if (nodes === undefined) {
        return __test(this._engine._storageNodes) ||
               __test(this._engine._compositeNodes) ||
               __test(this._engine._processNodes) ||
               __test(this._engine._entryNodes);
      } else {
        return __test(nodes);
      }
    }
    return null;
  },

  /**
   * Finds the category area of the palette at a given position.
   * @function wcPlayEditor#__findCategoryAreaAtPos
   * @private
   * @param {wcPlay~Coordinates} pos - The position.
   * @returns {Object|null} - The category data found, or null if not found.
   */
  __findCategoryAreaAtPos: function(pos) {
    for (var cat in this._nodeLibrary) {
      for (var type in this._nodeLibrary[cat]) {

        // Ignore types that are not visible.
        if (!this.$typeButton[this.__typeIndex(type)].hasClass('wcToggled')) continue;

        var typeData = this._nodeLibrary[cat][type];

        // Ignore categories that are not visible.
        if (!typeData.$button.hasClass('wcToggled')) continue;

        var rect = typeData.$canvas.offset();
        rect.width = typeData.$canvas.width();
        rect.height = typeData.$canvas.height();
        if (this.__inRect(pos, rect)) {
          return typeData;
        }
      }
    }

  },
};
var wcNodeNextID = 0;
Class.extend('wcNode', 'Node', '', {
  /**
   * @class
   * The foundation class for all nodes.<br>
   * When inheriting, make sure to include 'this._super(parent, pos, type);' at the top of your init functions.
   *
   * @constructor wcNode
   * @description
   * <b>Should be inherited and never constructed directly.</b>
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   * @param {String} [type="Node"] - The type name of the node, as displayed on the title bar.
   */
  init: function(parent, pos, type) {
    this.id = ++wcNodeNextID;
    this.type = type || this.name;
    this.name = '';
    this.color = '#FFFFFF';

    this._viewportSize = null;

    this.pos = {
      x: pos && pos.x || 0,
      y: pos && pos.y || 0,
    };

    this.chain = {
      entry: [],
      exit: [],
    };
    this.properties = [];

    this._meta = {
      flash: false,
      flashDelta: 0,
      color: null,
      paused: false,
      awake: false,
      threads: [],
    };
    this._collapsed = false;
    this._break = false;

    this._parent = parent;

    // Give the node its default properties.
    this.createProperty(wcNode.PROPERTY.ENABLED, wcPlay.PROPERTY_TYPE.TOGGLE, true, {collapsible: true});
    this.createProperty(wcNode.PROPERTY.DEBUG_LOG, wcPlay.PROPERTY_TYPE.TOGGLE, false, {collapsible: true});

    var engine = this.engine();
    engine && engine.__addNode(this);
  },

  /**
   * Destroys and removes the node.
   * @function wcNode#destroy
   */
  destroy: function() {
    // Remove all links.
    for (var i = 0; i < this.chain.entry.length; ++i) {
      var item = this.chain.entry[i];
      this.disconnectEntry(item.name);
    }

    for (var i = 0; i < this.chain.exit.length; ++i) {
      var item = this.chain.exit[i];
      this.disconnectExit(item.name);
    }

    for (var i = 0; i < this.properties.length; ++i) {
      var item = this.properties[i];
      this.disconnectInput(item.name);
      this.disconnectOutput(item.name);
    }

    this.reset();

    // Remove the node from wcPlay
    var engine = this.engine();
    engine && engine.__removeNode(this);
  },

  /**
   * Resets all properties to their initial values.
   * @function wcNode#reset
   */
  reset: function() {
    for (var i = 0; i < this.properties.length; ++i) {
      this.properties[i].value = this.properties[i].initialValue;
    }

    for (var i = 0; i < this._meta.threads.length; ++i) {
      if (typeof this._meta.threads[i] === 'number') {
        clearTimeout(this._meta.threads[i]);
        clearInterval(this._meta.threads[i]);
      }
    }
    this._meta.threads = [];
  },

  /**
   * Retrieves the wcPlay engine that owns this node.
   * @function wcNode#engine
   * @returns {wcPlay|null} - Either the wcPlay engine, or null if it doesn't belong to one.
   */
  engine: function() {
    var play = this._parent;
    while (play && !(play instanceof wcPlay)) {
      play = play._parent;
    }
    return play || null;
  },

  /**
   * Sets, or Gets this node's enabled state.
   * @function wcNode#enabled
   * @param {Boolean} [enabled] - If supplied, will assign a new enabled state.
   * @returns {Boolean} - The current enabled state.
   */
  enabled: function(enabled) {
    if (enabled !== undefined) {
      this.property(wcNode.PROPERTY.ENABLED, enabled? true: false);
    }

    return this.property(wcNode.PROPERTY.ENABLED);
  },

  /**
   * Sets, or Gets this node's debug log state.
   * @function wcNode#debugLog
   * @param {Boolean} [enabled] - If supplied, will assign a new debug log state.
   * @returns {Boolean} - The current debug log state.
   */
  debugLog: function(enabled) {
    if (enabled !== undefined) {
      this.property(wcNode.PROPERTY.DEBUG_LOG, enabled? true: false);
    }

    var engine = this.engine();
    return (!engine || engine.silent())? false: this.property(wcNode.PROPERTY.DEBUG_LOG);
  },

  /**
   * Sets, or Gets this node's debug pause state.
   * @function wcNode#debugBreak
   * @param {Boolean} [enabled] - If supplied, will assign a new debug pause state.
   * @returns {Boolean} - The current debug pause state.
   */
  debugBreak: function(enabled) {
    if (enabled !== undefined) {
      this._break = enabled? true: false;
    }

    var engine = this.engine();
    return (engine && engine.debugging() && this._break);
  },

  /**
   * Sets, or Gets this node's collapsed state.
   * @function wcNode#collapsed
   * @param {Boolean} [enabled] - If supplied, will assign a new debug pause state.
   * @returns {Boolean} - The current debug pause state.
   */
  collapsed: function(enabled) {
    if (enabled !== undefined) {
      this._collapsed = enabled;
    }

    return this._collapsed;
  },

  /**
   * If your node takes time to process, call this to begin a thread that will keep the node 'active' until you close the thread with {@link wcNode#finishThread}.<br>
   * This ensures that, even if a node is executed more than once at the same time, each 'thread' is kept track of individually.<br>
   * <b>Note:</b> This is not necessary if your node executes immediately without a timeout.
   * @function wcNode#beginThread
   * @params {Number} id - The thread ID, generated by a call to setTimeout, setInterval, or a Promise object.
   * @returns {Number} - The id that was given {@link wcNode#finishThread}.
   * @example
   *  onTriggered: function(name) {
   *    this._super(name);
   *
   *    // Always fire the 'out' link immediately.
   *    this.triggerExit('out');
   *
   *    // Now set a timeout to wait for 'Milliseconds' amount of time.
   *    var self = this;
   *    var delay = this.property('milliseconds');
   *
   *    // Start a new thread that will keep the node alive until we are finished.
   *    var thread = this.beginThread(setTimeout(function() {
   *      // Once the time has completed, fire the 'Finished' link and finish our thread.
   *      self.triggerExit('finished');
   *      self.finishThread(thread);
   *    }, delay));
   *  },
   *
   */
  beginThread: function(id) {
    this._meta.threads.push(id);
    this._meta.awake = true;
    return id;
  },

  /**
   * Finishes a previously started thread from {@link wcNode#beginThread}.<br>
   * <b>Note:</b> If you do not properly finish a thread that was generated, your node will remain forever in its active state.
   * @function wcNode#finishThread
   * @params {Number} id - The thread ID to close, generated by a call to setTimeout, setInterval, or a Promise object.
   */
  finishThread: function(id) {
    var index = this._meta.threads.indexOf(id);
    if (index > -1) {
      this._meta.threads.splice(index, 1);

      if (!this._meta.threads.length) {
        this._meta.awake = false;
      }
    }
  },

  /**
   * Gets, or Sets the current position of the node.
   * @function wcNode#pos
   * @param {wcPlay~Coordinates} [pos] - If supplied, will assign a new position for this node.
   * @returns {wcPlay~Coordinates} - The current position of this node.
   */
  pos: function(pos) {
    if (pos !== undefined) {
      this.pos.x = pos.x;
      this.pos.y = pos.y;
    }

    return {x: this.pos.x, y: this.pos.y};
  },

  /**
   * Creates a new entry link on the node.
   * @function wcNode#createEntry
   * @param {String} [name="In"] - The name of the entry link.
   * @returns {Boolean} - Fails if the entry link name already exists.
   */
  createEntry: function(name) {
    for (var i = 0; i < this.chain.entry.length; ++i) {
      if (this.chain.entry[i].name === name) {
        return false;
      }
    }

    this.chain.entry.push({
      name: name,
      active: false,
      links: [],
      meta: {
        flash: false,
        flashDelta: 0,
        color: "#000000",
      },
    });
    return true;
  },

  /**
   * Creates a new exit link on the node.
   * @function wcNode#createExit
   * @param {String} name - The name of the exit link.
   * @returns {Boolean} - Fails if the exit link name already exists.
   */
  createExit: function(name) {
    for (var i = 0; i < this.chain.exit.length; ++i) {
      if (this.chain.exit[i].name === name) {
        return false;
      }
    }

    this.chain.exit.push({
      name: name,
      links: [],
      meta: {
        flash: false,
        flashDelta: 0,
        color: "#000000",
      },
    });
    return true;
  },

  /**
   * Creates a new property.
   * @function wcNode#createProperty
   * @param {String} name - The name of the property.
   * @param {wcPlay.PROPERTY_TYPE} type - The type of property.
   * @param {Object} [initialValue] - A initial value for this property when the script starts.
   * @param {Object} [options] - Additional options for this property, see {@link wcPlay.PROPERTY_TYPE}.
   * @returns {Boolean} - Failes if the property does not exist.
   */
  createProperty: function(name, type, initialValue, options) {
    // Make sure this property doesn't already exist.
    for (var i = 0; i < this.properties.length; ++i) {
      if (this.properties[i].name === name) {
        return false;
      }
    }

    if (initialValue === undefined) {
      initialValue = 0;
    }

    this.properties.push({
      name: name,
      value: initialValue,
      initialValue: initialValue,
      type: type,
      inputs: [],
      outputs: [],
      options: options || {},
      inputMeta: {
        flash: false,
        flashDelta: 0,
        color: "#000000",
      },
      outputMeta: {
        flash: false,
        flashDelta: 0,
        color: "#000000",
      },
    });
    return true;
  },

  /**
   * Removes an entry link from the node.
   * @function wcNode#removeEntry
   * @param {String} name - The name of the entry link to remove.
   * @returns {Boolean} - Fails if the link does not exist.
   */
  removeEntry: function(name) {
    for (var i = 0; i < this.chain.entry.length; ++i) {
      if (this.chain.entry[i].name === name) {
        if (this.disconnectEntry(name) === wcNode.CONNECT_RESULT.SUCCESS) {
          this.chain.entry.splice(i, 1);
          return true;
        }
      }
    }
    return false;
  },

  /**
   * Removes an exit link from the node.
   * @function wcNode#removeExit
   * @param {String} name - The name of the exit link to remove.
   * @returns {Boolean} - Fails if the link does not exist.
   */
  removeExit: function(name) {
    for (var i = 0; i < this.chain.exit.length; ++i) {
      if (this.chain.exit[i].name === name) {
        if (this.disconnectExit(name) === wcNode.CONNECT_RESULT.SUCCESS) {
          this.chain.exit.splice(i, 1);
          return true;
        }
      }
    }
    return false;
  },

  /**
   * Removes a property from the node.
   * @function wcNode#removeProperty
   * @param {String} name - The name of the property to remove.
   * @returns {Boolean} - Fails if the property does not exist.
   */
  removeProperty: function(name) {
    for (var i = 0; i < this.properties.length; ++i) {
      if (this.properties[i].name === name) {
        if (this.disconnectInput(name) === this.disconnectOutput(name) === wcNode.CONNECT_RESULT.SUCCESS) {
          this.properties.splice(i, 1);
          return true;
        }
      }
    }
    return false;
  },

  /**
   * Connects an entry link on this node to an exit link of another.
   * @function wcNode#connectEntry
   * @param {String} name - The name of the entry link on this node.
   * @param {wcNode} targetNode - The target node to link to.
   * @param {String} targetName - The name of the target node's exit link to link to.
   * @returns {wcNode.CONNECT_RESULT} - The result.
   */
  connectEntry: function(name, targetNode, targetName) {
    if (!(targetNode instanceof wcNode)) {
      return wcNode.CONNECT_RESULT.NOT_FOUND;
    }

    var myLink = null;
    var targetLink = null;

    // Find my link.
    for (var i = 0; i < this.chain.entry.length; ++i) {
      if (this.chain.entry[i].name === name) {
        myLink = this.chain.entry[i];
        break;
      }
    }

    // Find the target link.
    for (var i = 0; i < targetNode.chain.exit.length; ++i) {
      if (targetNode.chain.exit[i].name === targetName) {
        targetLink = targetNode.chain.exit[i];
        break;
      }
    }

    if (!myLink || !targetLink) {
      return wcNode.CONNECT_RESULT.NOT_FOUND;
    }

    // Make sure the connection doesn't already exist.
    for (var i = 0; i < myLink.links.length; ++i) {
      if (myLink.links[i].node === targetNode && myLink.links[i].name === targetLink.name) {
        return wcNode.CONNECT_RESULT.ALREADY_CONNECTED;
      }
    }

    for (var i = 0; i < targetLink.links.length; ++i) {
      if (targetLink.links[i].node === this && targetLink.links[i].name === myLink.name) {
        return wcNode.CONNECT_RESULT.ALREADY_CONNECTED;
      }
    }

    // Now make the connection.
    myLink.links.push({
      name: targetLink.name,
      node: targetNode,
    });

    targetLink.links.push({
      name: myLink.name,
      node: this,
    });

    // Notify of the connection change.
    this.onConnect(true, myLink.name, wcNode.LINK_TYPE.ENTRY, targetNode, targetLink.name, wcNode.LINK_TYPE.EXIT);
    targetNode.onConnect(true, targetLink.name, wcNode.LINK_TYPE.EXIT, this, myLink.name, wcNode.LINK_TYPE.ENTRY);
    return wcNode.CONNECT_RESULT.SUCCESS;
  },

  /**
   * Connects an exit link on this node to an entry link of another.
   * @function wcNode#connectExit
   * @param {String} name - The name of the exit link on this node.
   * @param {wcNode} targetNode - The target node to link to.
   * @param {String} targetName - The name of the target node's entry link to link to.
   * @returns {wcNode.CONNECT_RESULT} - The result.
   */
  connectExit: function(name, targetNode, targetName) {
    if (!(targetNode instanceof wcNode)) {
      return wcNode.CONNECT_RESULT.NOT_FOUND;
    }

    var myLink = null;
    var targetLink = null;

    // Find my link.
    for (var i = 0; i < this.chain.exit.length; ++i) {
      if (this.chain.exit[i].name === name) {
        myLink = this.chain.exit[i];
        break;
      }
    }

    // Find the target link.
    for (var i = 0; i < targetNode.chain.entry.length; ++i) {
      if (targetNode.chain.entry[i].name === targetName) {
        targetLink = targetNode.chain.entry[i];
        break;
      }
    }

    if (!myLink || !targetLink) {
      return wcNode.CONNECT_RESULT.NOT_FOUND;
    }

    // Make sure the connection doesn't already exist.
    for (var i = 0; i < myLink.links.length; ++i) {
      if (myLink.links[i].node === targetNode && myLink.links[i].name === targetLink.name) {
        return wcNode.CONNECT_RESULT.ALREADY_CONNECTED;
      }
    }

    for (var i = 0; i < targetLink.links.length; ++i) {
      if (targetLink.links[i].node === this && targetLink.links[i].name === myLink.name) {
        return wcNode.CONNECT_RESULT.ALREADY_CONNECTED;
      }
    }

    // Now make the connection.
    myLink.links.push({
      name: targetLink.name,
      node: targetNode,
    });

    targetLink.links.push({
      name: myLink.name,
      node: this,
    });

    // Notify of the connection change.
    this.onConnect(true, myLink.name, wcNode.LINK_TYPE.EXIT, targetNode, targetLink.name, wcNode.LINK_TYPE.ENTRY);
    targetNode.onConnect(true, targetLink.name, wcNode.LINK_TYPE.ENTRY, this, myLink.name, wcNode.LINK_TYPE.EXIT);
    return wcNode.CONNECT_RESULT.SUCCESS;
  },

  /**
   * Connects a property input link to a target property output link.
   * @function wcNode#connectInput
   * @param {String} name - The name of the property being connected.
   * @param {wcNode} targetNode - The target node to connect with.
   * @param {String} targetName - The name of the property on the target node to connect with.
   * @returns {wcNode.CONNECT_RESULT} - The result.
   */
  connectInput: function(name, targetNode, targetName) {
    if (!(targetNode instanceof wcNode)) {
      return wcNode.CONNECT_RESULT.NOT_FOUND;
    }

    var myProperty = null;
    var targetProperty = null;

    // Find my property.
    for (var i = 0; i < this.properties.length; ++i) {
      if (this.properties[i].name === name) {
        myProperty = this.properties[i];
        break;
      }
    }

    // Find the target property.
    for (var i = 0; i < targetNode.properties.length; ++i) {
      if (targetNode.properties[i].name === targetName) {
        targetProperty = targetNode.properties[i];
        break;
      }
    }

    if (!myProperty || !targetProperty) {
      return wcNode.CONNECT_RESULT.NOT_FOUND;
    }

    // Make sure the connection doesn't already exist.
    for (var i = 0; i < myProperty.inputs.length; ++i) {
      if (myProperty.inputs[i].node === targetNode && myProperty.inputs[i].name === targetProperty.name) {
        return wcNode.CONNECT_RESULT.ALREADY_CONNECTED;
      }
    }

    for (var i = 0; i < targetProperty.outputs.length; ++i) {
      if (targetProperty.outputs[i].node === this && targetProperty.outputs[i].name === myProperty.name) {
        return wcNode.CONNECT_RESULT.ALREADY_CONNECTED;
      }
    }

    // Now make the connection.
    myProperty.inputs.push({
      name: targetProperty.name,
      node: targetNode,
    });

    targetProperty.outputs.push({
      name: myProperty.name,
      node: this,
    });

    // Notify of the connection change.
    this.onConnect(true, myProperty.name, wcNode.LINK_TYPE.INPUT, targetNode, targetProperty.name, wcNode.LINK_TYPE.OUTPUT);
    targetNode.onConnect(true, targetProperty.name, wcNode.LINK_TYPE.OUTPUT, this, myProperty.name, wcNode.LINK_TYPE.INPUT);
    return wcNode.CONNECT_RESULT.SUCCESS;
  },

  /**
   * Connects a property output link to a target property input link.
   * @function wcNode#connectOutput
   * @param {String} name - The name of the property being connected.
   * @param {wcNode} targetNode - The target node to connect with.
   * @param {String} targetName - The name of the property on the target node to connect with.
   * @returns {wcNode.CONNECT_RESULT} - The result.
   */
  connectOutput: function(name, targetNode, targetName) {
    if (!(targetNode instanceof wcNode)) {
      return wcNode.CONNECT_RESULT.NOT_FOUND;
    }

    var myProperty = null;
    var targetProperty = null;

    // Find my property.
    for (var i = 0; i < this.properties.length; ++i) {
      if (this.properties[i].name === name) {
        myProperty = this.properties[i];
        break;
      }
    }

    // Find the target property.
    for (var i = 0; i < targetNode.properties.length; ++i) {
      if (targetNode.properties[i].name === targetName) {
        targetProperty = targetNode.properties[i];
        break;
      }
    }

    if (!myProperty || !targetProperty) {
      return wcNode.CONNECT_RESULT.NOT_FOUND;
    }

    // Make sure the connection doesn't already exist.
    for (var i = 0; i < myProperty.outputs.length; ++i) {
      if (myProperty.outputs[i].node === targetNode && myProperty.outputs[i].name === targetProperty.name) {
        return wcNode.CONNECT_RESULT.ALREADY_CONNECTED;
      }
    }

    for (var i = 0; i < targetProperty.inputs.length; ++i) {
      if (targetProperty.inputs[i].node === this && targetProperty.inputs[i].name === myProperty.name) {
        return wcNode.CONNECT_RESULT.ALREADY_CONNECTED;
      }
    }

    // Now make the connection.
    myProperty.outputs.push({
      name: targetProperty.name,
      node: targetNode,
    });

    targetProperty.inputs.push({
      name: myProperty.name,
      node: this,
    });

    // Notify of the connection change.
    this.onConnect(true, myProperty.name, wcNode.LINK_TYPE.OUTPUT, targetNode, targetProperty.name, wcNode.LINK_TYPE.INPUT);
    targetNode.onConnect(true, targetProperty.name, wcNode.LINK_TYPE.INPUT, this, myProperty.name, wcNode.LINK_TYPE.OUTPUT);
    return wcNode.CONNECT_RESULT.SUCCESS;
  },

  /**
   * Disconnects a chain, or all chains, from an entry link.
   * @function wcNode#disconnectEntry
   * @param {String} name - The name of the entry link.
   * @param {wcNode} [targetNode] - If supplied, will only remove links to the specified target node.
   * @param {String} [targetName] - If supplied, will only remove links to the specified named exit links.
   * @returns {wcNode.CONNECT_RESULT}
   */
  disconnectEntry: function(name, targetNode, targetName) {
    // Find my entry link.
    var myLink = null;
    for (var i = 0; i < this.chain.entry.length; ++i) {
      if (this.chain.entry[i].name === name) {
        myLink = this.chain.entry[i];
        break;
      }
    }

    if (!myLink) {
      return wcNode.CONNECT_RESULT.NOT_FOUND;
    }

    // Iterate through all chained links and disconnect as necessary.
    for (var i = 0; i < myLink.links.length; ++i) {
      var targetLink = myLink.links[i];
      if ((!targetNode || targetNode === targetLink.node) && (!targetName || targetName === targetLink.name)) {
        // Remove this link.
        myLink.links.splice(i, 1);
        i--;

        targetLink.node.disconnectExit(targetLink.name, this, name);
      }
    }
    return wcNode.CONNECT_RESULT.SUCCESS;
  },

  /**
   * Disconnects a chain, or all chains, from an exit link.
   * @function wcNode#disconnectExit
   * @param {String} name - The name of the exit link.
   * @param {wcNode} [targetNode] - If supplied, will only remove links to the specified target node.
   * @param {String} [targetName] - If supplied, will only remove links to the specified named entry links.
   * @returns {wcNode.CONNECT_RESULT}
   */
  disconnectExit: function(name, targetNode, targetName) {
    // Find my exit link.
    var myLink = null;
    for (var i = 0; i < this.chain.exit.length; ++i) {
      if (this.chain.exit[i].name === name) {
        myLink = this.chain.exit[i];
        break;
      }
    }

    if (!myLink) {
      return wcNode.CONNECT_RESULT.NOT_FOUND;
    }

    // Iterate through all chained links and disconnect as necessary.
    for (var i = 0; i < myLink.links.length; ++i) {
      var targetLink = myLink.links[i];
      if ((!targetNode || targetNode === targetLink.node) && (!targetName || targetName === targetLink.name)) {
        // Remove this link.
        myLink.links.splice(i, 1);
        i--;

        targetLink.node.disconnectEntry(targetLink.name, this, name);
      }
    }
    return wcNode.CONNECT_RESULT.SUCCESS;
  },

  /**
   * Disconnects a chain, or all chains, from a property input.
   * @function wcNode#disconnectInput
   * @param {String} name - The name of the property.
   * @param {wcNode} [targetNode] - If supplied, will only remove links to the specified target node.
   * @param {String} [targetName] - If supplied, will only remove links to the specified named property output links.
   * @returns {wcNode.CONNECT_RESULT}
   */
  disconnectInput: function(name, targetNode, targetName) {
    // Find my property.
    var myProperty = null;
    for (var i = 0; i < this.properties.length; ++i) {
      if (this.properties[i].name === name) {
        myProperty = this.properties[i];
        break;
      }
    }

    if (!myProperty) {
      return wcNode.CONNECT_RESULT.NOT_FOUND;
    }

    // Iterate through all chained links and disconnect as necessary.
    for (var i = 0; i < myProperty.inputs.length; ++i) {
      var targetProperty = myProperty.inputs[i];
      if ((!targetNode || targetNode === targetProperty.node) && (!targetName || targetName === targetProperty.name)) {
        // Remove this link.
        myProperty.inputs.splice(i, 1);
        i--;

        targetProperty.node.disconnectOutput(targetProperty.name, this, name);
      }
    }
    return wcNode.CONNECT_RESULT.SUCCESS;
  },

  /**
   * Disconnects a chain, or all chains, from a property output.
   * @function wcNode#disconnectOutput
   * @param {String} name - The name of the property.
   * @param {wcNode} [targetNode] - If supplied, will only remove links to the specified target node.
   * @param {String} [targetName] - If supplied, will only remove links to the specified named property input links.
   * @returns {wcNode.CONNECT_RESULT}
   */
  disconnectOutput: function(name, targetNode, targetName) {
    // Find my property.
    var myProperty = null;
    for (var i = 0; i < this.properties.length; ++i) {
      if (this.properties[i].name === name) {
        myProperty = this.properties[i];
        break;
      }
    }

    if (!myProperty) {
      return wcNode.CONNECT_RESULT.NOT_FOUND;
    }

    // Iterate through all chained links and disconnect as necessary.
    for (var i = 0; i < myProperty.outputs.length; ++i) {
      var targetProperty = myProperty.outputs[i];
      if ((!targetNode || targetNode === targetProperty.node) && (!targetName || targetName === targetProperty.name)) {
        // Remove this link.
        myProperty.outputs.splice(i, 1);
        i--;

        targetProperty.node.disconnectInput(targetProperty.name, this, name);
      }
    }
    return wcNode.CONNECT_RESULT.SUCCESS;
  },

  /**
   * Retrieves a list of all chains connected to an entry link on this node.
   * @function wcNode#listEntryChains
   * @param {String} [name] - The entry link, if omitted, all link chains are retrieved.
   * @returns {wcNode~ChainData[]} - A list of all chains connected to this link, if the link was not found, an empty list is returned.
   */
  listEntryChains: function(name) {
    var result = [];
    for (var i = 0; i < this.chain.entry.length; ++i) {
      if (!name || this.chain.entry[i].name === name) {
        var myLink = this.chain.entry[i];
        for (var a = 0; a < myLink.links.length; ++a) {
          result.push({
            inName: myLink.name,
            inNodeId: this.id,
            outName: myLink.links[a].name,
            outNodeId: myLink.links[a].node.id,
          });
        }
      }
    }

    return result;
  },

  /**
   * Retrieves a list of all chains connected to an exit link on this node.
   * @function wcNode#listExitChains
   * @param {String} [name] - The exit link, if omitted, all link chains are retrieved.
   * @returns {wcNode~ChainData[]} - A list of all chains connected to this link, if the link was not found, an empty list is returned.
   */
  listExitChains: function(name) {
    var result = [];
    for (var i = 0; i < this.chain.exit.length; ++i) {
      if (!name || this.chain.exit[i].name === name) {
        var myLink = this.chain.exit[i];
        for (var a = 0; a < myLink.links.length; ++a) {
          result.push({
            inName: myLink.links[a].name,
            inNodeId: myLink.links[a].node.id,
            outName: myLink.name,
            outNodeId: this.id,
          });
        }
      }
    }

    return result;
  },

  /**
   * Retrieves a list of all chains connected to a property input link on this node.
   * @function wcNode#listInputChains
   * @param {String} [name] - The property input link, if omitted, all link chains are retrieved.
   * @returns {wcNode~ChainData[]} - A list of all chains connected to this link, if the link was not found, an empty list is returned.
   */
  listInputChains: function(name) {
    var result = [];
    for (var i = 0; i < this.properties.length; ++i) {
      if (!name || this.properties[i].name === name) {
        var myProp = this.properties[i];
        for (var a = 0; a < myProp.inputs.length; ++a) {
          result.push({
            inName: myProp.name,
            inNodeId: this.id,
            outName: myProp.inputs[a].name,
            outNodeId: myProp.inputs[a].node.id,
          });
        }
      }
    }

    return result;
  },

  /**
   * Retrieves a list of all chains connected to a property output link on this node.
   * @function wcNode#listOutputChains
   * @param {String} [name] - The property output link, if omitted, all link chains are retrieved.
   * @returns {wcNode~ChainData[]} - A list of all chains connected to this link, if the link was not found, an empty list is returned.
   */
  listOutputChains: function(name) {
    var result = [];
    for (var i = 0; i < this.properties.length; ++i) {
      if (!name || this.properties[i].name === name) {
        var myProp = this.properties[i];
        for (var a = 0; a < myProp.outputs.length; ++a) {
          result.push({
            inName: myProp.outputs[a].name,
            inNodeId: myProp.outputs[a].node.id,
            outName: myProp.name,
            outNodeId: this.id,
          });
        }
      }
    }

    return result;
  },

  /**
   * Retrieves a list of all properties and their values for this node.
   * @function wcNode#listProperties
   * @returns {wcNode~PropertyData[]} - A list of all property data.
   */
  listProperties: function() {
    var result = [];
    for (var i = 0; i < this.properties.length; ++i) {
      var myProp = this.properties[i];
      result.push({
        name: myProp.name,
        value: myProp.value,
        initialValue: myProp.initialValue,
      });
    }

    return result;
  },

  /**
   * Triggers an entry link and activates this node.
   * @function wcNode#triggerEntry
   * @param {String} name - The name of the entry link to trigger.
   * @returns {Boolean} - Fails if the entry link does not exist.
   */
  triggerEntry: function(name) {
    for (var i = 0; i < this.chain.entry.length; ++i) {
      if (this.chain.entry[i].name == name) {
        // Always queue the trigger so execution is not immediate.
        var engine = this.engine();
        this.chain.entry[i].meta.flash = true;
        if (this.debugBreak() || (engine && engine.stepping())) {
          this.chain.entry[i].meta.paused = true;
        }
        engine && engine.queueNodeEntry(this, this.chain.entry[i].name);
        return true;
      }
    }

    return false;
  },

  /**
   * Triggers an exit link.
   * @function wcNode#triggerExit
   * @param {String} name - The name of the exit link to trigger.
   * @returns {Boolean} - Fails if the exit link does not exist.
   */
  triggerExit: function(name) {
    if (this.debugLog()) {
      console.log('DEBUG: Node "' + this.category + '.' + this.type + (this.name? ' - ' + this.name: '') + '" Triggered Exit link "' + name + '"');
    }

    for (var i = 0; i < this.chain.exit.length; ++i) {
      var exitLink = this.chain.exit[i];
      if (exitLink.name == name) {
        this.chain.exit[i].meta.flash = true;
        // Activate all entry links chained to this exit.
        var engine = this.engine();

        for (var a = 0; a < exitLink.links.length; ++a) {
          if (exitLink.links[a].node) {
            exitLink.links[a].node.triggerEntry(exitLink.links[a].name);
            if (exitLink.links[a].node.debugBreak() || (engine && engine.stepping())) {
              this.chain.exit[i].meta.paused = true;
            }
          }
        }
        return true;
      }
    }

    return false;
  },

  /**
   * Gets, or Sets the value of a property.
   * @function wcNode#property
   * @param {String} name - The name of the property.
   * @param {Object} [value] - If supplied, will assign a new value to the property.
   * @param {Boolean} [forceOrSilent] - If supplied, true will force the change event to be sent to all chained properties even if this value didn't change while false will force the change to not be chained.
   * @returns {Object|undefined} - The value of the property, or undefined if not found.
   */
  property: function(name, value, forceOrSilent) {
    for (var i = 0; i < this.properties.length; ++i) {
      var prop = this.properties[i];
      if (prop.name === name) {
        if (value !== undefined) {
          // Retrieve the current value of the property
          var oldValue = prop.value;

          var engine = this.engine();
          prop.outputMeta.flash = true;
          if (this.debugBreak() || (engine && engine.stepping())) {
            prop.outputMeta.paused = true;
          }

          // Notify about to change event.
          if (forceOrSilent || prop.value !== value) {
            value = this.onPropertyChanging(prop.name, oldValue, value) || value;
          }

          if (forceOrSilent || prop.value !== value) {
            prop.value = value;

            // Notify that the property has changed.
            this.onPropertyChanged(prop.name, oldValue, value);

            // Now follow any output links and assign the new value to them as well.
            if (forceOrSilent === undefined || forceOrSilent) {
              for (a = 0; a < prop.outputs.length; ++a) {
                prop.outputs[a].node && prop.outputs[a].node.triggerProperty(prop.outputs[a].name, value);
              }
            }
          }
        }

        return prop.value;
      }
    }
  },

  /**
   * Gets, or Sets the initial value of a property.
   * @function wcNode#initialProperty
   * @param {String} name - The name of the property.
   * @param {Object} [value] - If supplied, will assign a new default value to the property.
   * @returns {Object|undefined} - The default value of the property, or undefined if not found.
   */
  initialProperty: function(name, value) {
    for (var i = 0; i < this.properties.length; ++i) {
      var prop = this.properties[i];
      if (prop.name === name) {
        if (value !== undefined) {
          if (prop.value === prop.initialValue) {
            this.property(name, value);
          }
          prop.initialValue = value;
        }

        return prop.initialValue;
      }
    }
  },

  /**
   * Triggers a property that is about to be changed by the output of another property.
   * @function wcNode#triggerProperty
   * @param {String} name - The name of the property.
   * @param {Object} value - The new value of the property.
   */
  triggerProperty: function(name, value) {
    var engine = this.engine();
    if (engine) {
      engine.queueNodeProperty(this, name, value);
    }

    for (var i = 0; i < this.properties.length; ++i) {
      var prop = this.properties[i];
      if (prop.name === name) {
        prop.inputMeta.flash = true;
        if (this.debugBreak() || (engine && engine.stepping())) {
          prop.inputMeta.paused = true;
        }
      }
    }
  },

  /**
   * Sets a size for the custom viewport.<br>
   * The custom viewport is a rectangular area embedded into the node's visual display in which you can 'draw' whatever you wish. It appears below the title text and above properties.
   * @function wcNode#viewportSize
   * @param {Number} [width] - If supplied, assigns the width of the viewport desired. Use 0 or null to disable the viewport.
   * @param {Number} [height] - If supplied, assigns the height of the viewport desired. Use 0 or null to disable the viewport.
   * @returns {wcPlay~Coordinates} - The current size of the viewport.
   */
  viewportSize: function(width, height) {
    if (width !== undefined && height !== undefined) {
      if (!width || !height) {
        this._viewportSize = null;
      } else {
        this._viewportSize = {
          x: width,
          y: height,
        };
      }
    }

    return {x: this._viewportSize.x, y: this._viewportSize.y};
  },

  /**
   * Event that is called when it is time to draw the contents of your custom viewport.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNode#onViewport
   * @param {external:Canvas~Context} context - The canvas context to draw on, coordinates 0,0 will be the top left corner of your viewport. It is up to you to stay within the [viewport bounds]{@link wcNode#viewportSize} you have assigned.
   * @see wcNode#viewportSize
   */
  onViewport: function(context) {
  },

  /**
   * Event that is called when a connection has been made.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNode#onConnect
   * @param {Boolean} isConnecting - True if a connection is being made, false if it is a disconnection.
   * @param {String} name - The name of the link being connected to.
   * @param {wcNode.LINK_TYPE} type - The link's type.
   * @param {wcNode} targetNode - The target node being connected to.
   * @param {String} targetName - The link name on the target node being connected to.
   * @param {wcNode.LINK_TYPE} targetType - The target link's type.
   */
  onConnect: function(isConnecting, name, type, targetNode, targetName, targetType) {
    // If we are connecting one of our property outputs to another property, alert them and send your value to them.
    if (isConnecting && type === wcNode.LINK_TYPE.OUTPUT) {
      targetNode.triggerProperty(targetName, this.property(name));
    }
  },

  /**
   * Event that is called as soon as the Play script has started.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNode#onStart
   */
  onStart: function() {
    if (this.debugLog()) {
      console.log('DEBUG: Node "' + this.category + '.' + this.type + (this.name? ' - ' + this.name: '') + '" started!');
    }
  },

  /**
   * Event that is called when an entry link has been triggered.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNode#onTriggered
   * @param {String} name - The name of the entry link triggered.
   */
  onTriggered: function(name) {
    if (this.debugLog()) {
      console.log('DEBUG: Node "' + this.category + '.' + this.type + (this.name? ' - ' + this.name: '') + '" Triggered Entry link "' + name + '"');
    }
  },

  /**
   * Event that is called when a property is about to be changed.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNode#onPropertyChanging
   * @param {String} name - The name of the property.
   * @param {Object} oldValue - The current value of the property.
   * @param {Object} newValue - The new, proposed, value of the property.
   * @returns {Object} - Return the new value of the property (usually newValue unless you are proposing restrictions). If no value is returned, newValue is assumed.
   */
  onPropertyChanging: function(name, oldValue, newValue) {
    // if (this.debugLog()) {
    //   console.log('DEBUG: Node "' + this.category + '.' + this.type + (this.name? ' - ' + this.name: '') + '" Changing Property "' + name + '" from "' + oldValue + '" to "' + newValue + '"');
    // }
  },

  /**
   * Event that is called when a property has changed.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNode#onPropertyChanged
   * @param {String} name - The name of the property.
   * @param {Object} oldValue - The old value of the property.
   * @param {Object} newValue - The new value of the property.
   */
  onPropertyChanged: function(name, oldValue, newValue) {
    if (this.debugLog()) {
      console.log('DEBUG: Node "' + this.category + '.' + this.type + (this.name? ' - ' + this.name: '') + '" Changed Property "' + name + '" from "' + oldValue + '" to "' + newValue + '"');
    }
  },

  /**
   * Event that is called when the property is being asked its value, before the value is actually retrieved.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNode#onPropertyGet
   * @param {String} name - The name of the property.
   */
  onPropertyGet: function(name) {
    // if (this.debugLog()) {
    //   console.log('DEBUG: Node "' + this.category + '.' + this.type + (this.name? ' - ' + this.name: '') + '" Requested Property "' + name + '"');
    // }
  },

  /**
   * Event that is called when the property has had its value retrieved.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNode#onPropertyGot
   * @param {String} name - The name of the property.
   */
  onPropertyGot: function(name) {
    if (this.debugLog()) {
      console.log('DEBUG: Node "' + this.category + '.' + this.type + (this.name? ' - ' + this.name: '') + '" Got Property "' + name + '"');
    }
  },

  /**
   * Event that is called when a global property value has changed.
   * Overload this in inherited nodes.<br>
   * <b>Note:</b> Do not call 'this._super(..)' for this function, as the parent does not implement it.
   * @function wcNode#onSharedPropertyChanged
   * @param {String} name - The name of the global property.
   * @param {Object} oldValue - The old value of the global property.
   * @param {Object} newValue - The new value of the global property.
   */
  // onSharedPropertyChanged: function(name, oldValue, newValue) {
  // },

  /**
   * Event that is called when a global property has been renamed.
   * Overload this in inherited nodes.<br>
   * <b>Note:</b> Do not call 'this._super(..)' for this function, as the parent does not implement it.
   * @function wcNode#onSharedPropertyRenamed
   * @param {String} oldName - The old name of the global property.
   * @param {String} newName - The new name of the global property.
   */
  // onSharedPropertyRenamed: function(oldName, newName) {
  // },
});

/**
 * The type of node link.
 * @enum {String}
 */
wcNode.LINK_TYPE = {
  ENTRY: 'entry',
  EXIT: 'exit',
  INPUT: 'input',
  OUTPUT: 'output',
};

/**
 * The connection result.
 * @enum {String}
 */
wcNode.CONNECT_RESULT = {
  NOT_FOUND: 'not_found',
  ALREADY_CONNECTED: 'already_connected',
  SUCCESS: 'success',
};


/**
 * Default property type names.
 * @enum {String}
 */
wcNode.PROPERTY = {
  ENABLED: 'enabled',
  DEBUG_LOG: 'debug log',
};
wcNode.extend('wcNodeEntry', 'Entry Node', '', {
  /**
   * @class
   * The base class for all entry nodes. These are nodes that start script chains.<br>
   * When inheriting, make sure to include 'this._super(parent, pos, type);' at the top of your init function.
   *
   * @constructor wcNodeEntry
   * @description
   * <b>Should be inherited and never constructed directly.</b>
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   * @param {String} [type="Entry Node"] - The type name of the node, as displayed on the title bar.
   */
  init: function(parent, pos, type) {
    this._super(parent, pos, type);
    this.color = '#CCCC00';

    // Create a default exit link.
    this.createExit('out');
  },

  /**
   * Magic function that is called whenever any new class type is extended from this one.<br>
   * Handles initializing of the class as well as registering the new node type.
   * @function wcNodeEntry#classInit
   * @param {String} className - The name of the class constructor.
   * @param {String} name - A display name for the node.
   * @param {String} category - A category where this node will be grouped.
   */
  classInit: function(className, name, category) {
    if (category) {
      this.className = className;
      this.name = name;
      this.category = category;
      wcPlay.registerNodeType(className, name, category, wcPlay.NODE_TYPE.ENTRY);
    }
  },

  /**
   * Overloading the default onTriggered event handler so we can make it immediately trigger our exit link if our conditions are met.
   * @function wcNodeEntry#onTriggered
   * @see wcNodeEntry#triggerCondition
   * @param {Object} [data] - A custom data object passed in from the triggerer.
   */
  onTriggered: function(data) {
    if (this.triggerCondition(data)) {
      this.triggerExit('out');
    }
  },

  /**
   * Overload this in inherited nodes if you want to apply a condition when this entry node is triggered.
   * @function wcNodeEntry#triggerCondition
   * @returns {Boolean} - Whether the condition passes and the entry node should trigger (true by default).
   * @param {Object} [data] - A custom data object passed in from the triggerer.
   */
  triggerCondition: function(data) {
    return true;
  },

  // *
  //  * Event that is called when a property has changed.<br>
  //  * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
  //  * @function wcNode#onPropertyChanged
  //  * @param {String} name - The name of the property.
  //  * @param {Object} oldValue - The old value of the property.
  //  * @param {Object} newValue - The new value of the property.
   
  // onPropertyChanged: function(name, oldValue, newValue) {
  //   this._super(name, oldValue, newValue);

  //   // Manually trigger the event.
  //   // if (name === wcNode.PROPERTY.TRIGGER && newValue) {
  //   //   this.triggerExit('out');

  //   //   // Turn the toggle back off so it can be used again.
  //   //   this.property(wcNode.PROPERTY.TRIGGER, false);
  //   // }
  // },
});


wcNode.extend('wcNodeProcess', 'Node Process', '', {
  /**
   * @class
   * The base class for all process nodes. These are nodes that make up the bulk of script chains.<br>
   * When inheriting, make sure to include 'this._super(parent, pos, type);' at the top of your init function.
   *
   * @constructor wcNodeProcess
   * @description
   * <b>Should be inherited and never constructed directly.</b>
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   * @param {String} [type="Node Process"] - The type name of the node, as displayed on the title bar.
   */
  init: function(parent, pos, type) {
    this._super(parent, pos, type);
    this.color = '#007ACC';

    // Create a default links.
    this.createEntry('in');
    this.createExit('out');
  },

  /**
   * Magic function that is called whenever any new class type is extended from this one.<br>
   * Handles initializing of the class as well as registering the new node type.
   * @function wcNodeProcess#classInit
   * @param {String} className - The name of the class constructor.
   * @param {String} name - A display name for the node.
   * @param {String} category - A category where this node will be grouped.
   */
  classInit: function(className, name, category) {
    if (category) {
      this.className = className;
      this.name = name;
      this.category = category;
      wcPlay.registerNodeType(className, name, category, wcPlay.NODE_TYPE.PROCESS);
    }
  },
});

wcNode.extend('wcNodeStorage', 'Storage', '', {
  /**
   * @class
   * The base class for all storage nodes. These are nodes designed solely for managing data.<br>
   * When inheriting, make sure to include 'this._super(parent, pos, type);' at the top of your init function.<br>
   * Also when inheriting, a 'value' property MUST be created as the storage value.
   *
   * @constructor wcNodeStorage
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   * @param {String} [type="Storage"] - The type name of the node, as displayed on the title bar.
   */
  init: function(parent, pos, type) {
    this._super(parent, pos, type);
    this.color = '#009900';
  },

  /**
   * Magic function that is called whenever any new class type is extended from this one.<br>
   * Handles initializing of the class as well as registering the new node type.
   * @function wcNodeEntry#classInit
   * @param {String} className - The name of the class constructor.
   * @param {String} name - A display name for the node.
   * @param {String} category - A category where this node will be grouped.
   */
  classInit: function(className, name, category) {
    if (category) {
      this.className = className;
      this.name = name;
      this.category = category;
      wcPlay.registerNodeType(className, name, category, wcPlay.NODE_TYPE.STORAGE);
    }
  },

  /**
   * Event that is called as soon as the Play script has started.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNodeStorage#onStart
   */
  onStart: function() {
    this._super();

    // Force a property change event so all connected nodes receive our value.
    this.property('value', this.property('value'), true);
  },
});

wcNodeEntry.extend('wcNodeEntryStart', 'Start', 'Core', {
  /**
   * @class
   * An entry node that fires as soon as the script [starts]{@link wcPlay#start}.<br>
   * When inheriting, make sure to include 'this._super(parent, pos, type);' at the top of your init function.
   *
   * @constructor wcNodeEntryStart
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   * @param {String} [type="Start"] - The type name of the node, as displayed on the title bar.
   */
  init: function(parent, pos, type) {
    this._super(parent, pos, type);
  },

  /**
   * Event that is called as soon as the Play script has started.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNodeEntryStart#onStart
   */
  onStart: function() {
    this._super();
    this.onTriggered();
  },
});
wcNodeProcess.extend('wcNodeProcessDelay', 'Delay', 'Core', {
  /**
   * @class
   * Waits for a specified amount of time before continuing the node chain.<br>
   * When inheriting, make sure to include 'this._super(parent, pos, type);' at the top of your init function.
   *
   * @constructor wcNodeProcessDelay
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   * @param {String} [type="Delay"] - The type name of the node, as displayed on the title bar.
   */
  init: function(parent, pos, type) {
    this._super(parent, pos, type);

    // Create a finished exit that only triggers after the delay has elapsed.
    this.createExit('finished');

    // Create the message property so we know what to output in the log.
    this.createProperty('milliseconds', wcPlay.PROPERTY_TYPE.NUMBER, 1000);
  },

  /**
   * Event that is called when an entry link has been triggered.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNodeProcessDelay#onTriggered
   * @param {String} name - The name of the entry link triggered.
   */
  onTriggered: function(name) {
    this._super(name);

    // Always fire the 'out' link immediately.
    this.triggerExit('out');

    // Now set a timeout to wait for 'Milliseconds' amount of time.    
    var self = this;
    var delay = this.property('milliseconds');

    // Start a new thread that will keep the node alive until we are finished.
    var thread = this.beginThread(setTimeout(function() {
      // Once the time has completed, fire the 'Finished' link and finish our thread.
      self.triggerExit('finished');
      self.finishThread(thread);
    }, delay));
  },
});

wcNodeProcess.extend('wcNodeProcessConsoleLog', 'Console Log', 'Debugging', {
  /**
   * @class
   * For debugging purposes, will print out a message into the console log the moment it is activated. [Silent mode]{@link wcPlay~Options} will silence this node.<br>
   * When inheriting, make sure to include 'this._super(parent, pos, type);' at the top of your init function.
   *
   * @constructor wcNodeProcessConsoleLog
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   * @param {String} [type="Log"] - The type name of the node, as displayed on the title bar.
   */
  init: function(parent, pos, type) {
    this._super(parent, pos, type);

    // Create the message property so we know what to output in the log.
    this.createProperty('message', wcPlay.PROPERTY_TYPE.STRING, 'Log message.', {multiline: true});
  },

  /**
   * Event that is called when an entry link has been triggered.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNodeProcessConsoleLog#onTriggered
   * @param {String} name - The name of the entry link triggered.
   */
  onTriggered: function(name) {
    this._super(name);

    // Always trigger the out immediately.
    this.triggerExit('out');

    // Cancel the log in silent mode.
    var engine = this.engine();
    if (!engine || engine.silent()) {
      return;
    }

    var msg = this.property('message');
    console.log(msg);
  },
});

wcNodeProcess.extend('wcNodeProcessAlert', 'Alert', 'Debugging', {
  /**
   * @class
   * For debugging purposes, will popup an alert box with a message the moment it is activated. [Silent mode]{@link wcPlay~Options} will silence this node.<br>
   * When inheriting, make sure to include 'this._super(parent, pos, type);' at the top of your init function.
   *
   * @constructor wcNodeProcessAlert
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   * @param {String} [type="Log"] - The type name of the node, as displayed on the title bar.
   */
  init: function(parent, pos, type) {
    this._super(parent, pos, type);

    // Create the message property so we know what to output in the log.
    this.createProperty('message', wcPlay.PROPERTY_TYPE.STRING, 'Alert message.', {multiline: true});
  },

  /**
   * Event that is called when an entry link has been triggered.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNodeProcessAlert#onTriggered
   * @param {String} name - The name of the entry link triggered.
   */
  onTriggered: function(name) {
    this._super(name);

    // Always trigger the out immediately.
    this.triggerExit('out');

    // Cancel the log in silent mode.
    var engine = this.engine();
    if (!engine || engine.silent()) {
      return;
    }

    var msg = this.property('message');
    alert(msg);
  },
});

wcNodeProcess.extend('wcNodeProcessOperation', 'Operation', 'Core', {
  /**
   * @class
   * Performs a simple math operation on two values.
   * When inheriting, make sure to include 'this._super(parent, pos, type);' at the top of your init function.
   *
   * @constructor wcNodeProcessOperation
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   * @param {String} [type="Operation"] - The type name of the node, as displayed on the title bar.
   */
  init: function(parent, pos, type) {
    this._super(parent, pos, type);

    // Remove our default entry.
    this.removeEntry('in');

    // Create an input link per operation type.
    this.createEntry('add');
    this.createEntry('sub');
    this.createEntry('mul');
    this.createEntry('div');

    // Create our two operator values.
    this.createProperty('valueA', wcPlay.PROPERTY_TYPE.NUMBER, 0);
    this.createProperty('valueB', wcPlay.PROPERTY_TYPE.NUMBER, 0);
    this.createProperty('result', wcPlay.PROPERTY_TYPE.NUMBER, 0);
  },

  /**
   * Event that is called when an entry link has been triggered.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNodeProcessDelay#onTriggered
   * @param {String} name - The name of the entry link triggered.
   */
  onTriggered: function(name) {
    this._super(name);

    var a = parseFloat(this.property('valueA'));
    var b = parseFloat(this.property('valueB'));
    var result;

    switch (name) {
      case 'add': result = a + b; break;
      case 'sub': result = a - b; break;
      case 'mul': result = a * b; break;
      case 'div': result = a / b; break;
    }

    this.property('result', result);
    this.triggerExit('out');
  },
});

wcNodeStorage.extend('wcNodeStorageToggle', 'Toggle', 'Core', {
  /**
   * @class
   * Stores a boolean (toggleable) value.
   * When inheriting, make sure to include 'this._super(parent, pos, type);' at the top of your init function.
   *
   * @constructor wcNodeStorageToggle
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   * @param {String} [type="Toggle"] - The type name of the node, as displayed on the title bar.
   */
  init: function(parent, pos, type) {
    this._super(parent, pos, type);

    this.createProperty('value', wcPlay.PROPERTY_TYPE.TOGGLE, false);
  },
});

wcNodeStorage.extend('wcNodeStorageNumber', 'Number', 'Core', {
  /**
   * @class
   * Stores a number value.<br>
   * When inheriting, make sure to include 'this._super(parent, pos, type);' at the top of your init function.
   *
   * @constructor wcNodeStorageNumber
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   * @param {String} [type="Number"] - The type name of the node, as displayed on the title bar.
   */
  init: function(parent, pos, type) {
    this._super(parent, pos, type);

    this.createProperty('value', wcPlay.PROPERTY_TYPE.NUMBER);
  },
});

wcNodeStorage.extend('wcNodeStorageString', 'String', 'Core', {
  /**
   * @class
   * The base class for all storage nodes. These are nodes that interact with script variables and exchange data.<br>
   * When inheriting, make sure to include 'this._super(parent, pos, type);' at the top of your init function.
   *
   * @constructor wcNodeStorageString
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   * @param {String} [type="String"] - The type name of the node, as displayed on the title bar.
   */
  init: function(parent, pos, type) {
    this._super(parent, pos, type);

    this.createProperty('value', wcPlay.PROPERTY_TYPE.STRING, '', {multiline: true});
  },
});
