wcNodeStorage.extend('wcNodeStorageGlobal', 'Script Value', 'Global', {
  /**
   * @class
   * References a global property on the script.
   * When inheriting, make sure to include 'this._super(parent, pos);' at the top of your init function.
   *
   * @constructor wcNodeStorageGlobal
   * @param {String} parent - The parent object of this node.
   * @param {wcPlay~Coordinates} pos - The position of this node in the visual editor.
   */
  init: function(parent, pos) {
    this._super(parent, pos);
    this.color = '#77CC77';

    this.description("References a global property on the script.");
    this.details("The title name for this node becomes the name of the global property it references. Duplicate Global Nodes with the same name will all reference the same value.");

    this.createProperty('value', wcPlay.PROPERTY.STRING, '', {description: "The current value of the global property (Use the title to identify the property)."});
  },

  /**
   * Event that is called when the name of this node has changed.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNodeStorageGlobal#onNameChanged
   * @param {String} oldName - The current name.
   * @param {String} newName - The new name.
   */
  onNameChanged: function(oldName, newName) {
    this._super(oldName, newName);

    // Attempt to create a new property if it does not exist.
    var engine = this.engine();
    if (engine) {
      engine.createProperty(newName, wcPlay.PROPERTY.STRING, '');
      
      // Perform a search and remove all global properties no longer being referenced.
      var propList = engine.listProperties();

      var globalNodes = engine.nodesByClassName(this.className);
      for (var i = 0; i < globalNodes.length; ++i) {
        var name = globalNodes[i].name;
        for (var a = 0; a < propList.length; ++a) {
          if (propList[a].name === name) {
            propList.splice(a, 1);
            break;
          }
        }
      }

      for (var i = 0; i < propList.length; ++i) {
        engine.removeProperty(propList[i].name);
      }

      this.property('value', engine.property(newName));
      this.initialProperty('value', engine.initialProperty(newName));
    }
  },

  /**
   * Any changes to the 'value' property will also change the global property.<br>
   * Event that is called when a property has changed.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNodeStorageGlobal#onPropertyChanged
   * @param {String} name - The name of the property.
   * @param {Object} oldValue - The old value of the property.
   * @param {Object} newValue - The new value of the property.
   */
  onPropertyChanged: function(name, oldValue, newValue) {
    this._super(name, oldValue, newValue);

    if (name === 'value') {
      if (this.name) {
        var engine = this.engine();
        engine && engine.property(this.name, newValue);
      }
    }
  },

  /**
   * Always redirect property gets on 'value' to the referenced global property.<br>
   * Event that is called when the property is being asked its value, before the value is actually retrieved.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNodeStorageGlobal#onPropertyGet
   * @param {String} name - The name of the property.
   * @returns {Object|undefined} - If a value is returned, that value is what will be retrieved from the get.
   */
  onPropertyGet: function(name) {
    this._super(name);

    if (name === 'value') {
      if (this.name) {
        var engine = this.engine();
        return (engine && engine.property(this.name));
      }
    }
  },

  /**
   * Any changes to the 'value' property will also change the global property.<br>
   * Event that is called when a property initial value is about to be changed.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNodeStorageGlobal#onInitialPropertyChanging
   * @param {String} name - The name of the property.
   * @param {Object} oldValue - The current value of the property.
   * @param {Object} newValue - The new, proposed, value of the property.
   * @returns {Object} - Return the new value of the property (usually newValue unless you are proposing restrictions). If no value is returned, newValue is assumed.
   */
  onInitialPropertyChanging: function(name, oldValue, newValue) {
    this._super(name, oldValue, newValue);

    if (name === 'value') {
      if (this.name) {
        var engine = this.engine();
        engine && engine.initialProperty(this.name, newValue);
      }
    }
  },

  /**
   * Always redirect property gets on 'value' to the referenced global property.<br>
   * Event that is called when the property initial value is being asked its value, before the value is actually retrieved.<br>
   * Overload this in inherited nodes, be sure to call 'this._super(..)' at the top.
   * @function wcNodeStorageGlobal#onInitialPropertyGet
   * @param {String} name - The name of the property.
   * @returns {Object|undefined} - If a value is returned, that value is what will be retrieved from the get.
   */
  onInitialPropertyGet: function(name) {
    this._super(name);

    if (name === 'value') {
      if (this.name) {
        var engine = this.engine();
        return (engine && engine.initialProperty(this.name));
      }
    }
  },


  /**
   * Event that is called when a global property value has changed.
   * Overload this in inherited nodes.<br>
   * <b>Note:</b> Do not call 'this._super(..)' for this function, as the parent does not implement it.
   * @function wcNodeStorageGlobal#onGlobalPropertyChanged
   * @param {String} name - The name of the global property.
   * @param {Object} oldValue - The old value of the global property.
   * @param {Object} newValue - The new value of the global property.
   */
  onGlobalPropertyChanged: function(name, oldValue, newValue) {
    if (this.name === name) {
      this.property('value', newValue, true, true);
      this._meta.dirty = true;
    };
  },

  /**
   * Event that is called when a global property initial value has changed.
   * Overload this in inherited nodes.<br>
   * <b>Note:</b> Do not call 'this._super(..)' for this function, as the parent does not implement it.
   * @function wcNodeStorageGlobal#onGlobalInitialPropertyChanged
   * @param {String} name - The name of the global property.
   * @param {Object} oldValue - The old value of the global property.
   * @param {Object} newValue - The new value of the global property.
   */
  onGlobalInitialPropertyChanged: function (name, oldValue, newValue) {
    if (this.name === name) {
      this.initialProperty('value', newValue, true, true);
      this._meta.dirty = true;
    }
  },

  /**
   * Event that is called when a global property has been removed.
   * Overload this in inherited nodes.<br>
   * <b>Note:</b> Do not call 'this._super(..)' for this function, as the parent does not implement it.
   * @function wcNodeStorageGlobal#onGlobalPropertyRemoved
   * @param {String} name - The name of the global property.
   */
  onGlobalPropertyRemoved: function(name) {
    if (this.name == name) {
      this.name = '';
    }
  },

  /**
   * Event that is called when a global property has been renamed.
   * Overload this in inherited nodes.<br>
   * <b>Note:</b> Do not call 'this._super(..)' for this function, as the parent does not implement it.
   * @function wcNodeStorageGlobal#onGlobalPropertyRenamed
   * @param {String} oldName - The old name of the global property.
   * @param {String} newName - The new name of the global property.
   */
  onGlobalPropertyRenamed: function(oldName, newName) {
    if (this.name == oldName) {
      this.name = newName;
    }
  },
});
