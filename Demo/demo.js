$(document).ready(function() {
  // Create an instance of our Play engine.
  var myPlay = new wcPlay({
    silent: false,
    updateRate: 10,
    updateLimit: 100,
    debugging: true,
  });

  // Load a pre-developed script (Serial string was previously generated by wcPlay.save).
  myPlay.load('{"version":"1.0.0","custom":null,"properties":[{"name":"","value":"","initialValue":"","type":"string","options":{}}],"nodes":[{"className":"wcNodeEntryRemote","id":432,"name":"Looper","color":"#CCCC00","pos":{"x":-871.4971405138398,"y":-51.140187842034074},"breakpoint":false,"properties":[{"name":"enabled","initialValue":true}],"exitChains":[{"inName":"in","inNodeId":402,"outName":"out","outNodeId":432}],"outputChains":[],"entryChains":[],"inputChains":[]},{"className":"wcNodeEntryCallRemote","id":433,"name":"Looper","color":"#CCCC00","pos":{"x":-819.6626751263923,"y":796.4138714813342},"breakpoint":false,"properties":[{"name":"enabled","initialValue":true},{"name":"local","initialValue":true}],"exitChains":[],"outputChains":[],"entryChains":[],"inputChains":[]},{"className":"wcNodeEntryStart","id":434,"name":"","color":"#CCCC00","pos":{"x":-601.5501191003581,"y":-49.754692461292315},"breakpoint":false,"properties":[{"name":"enabled","initialValue":true}],"exitChains":[{"inName":"in","inNodeId":402,"outName":"out","outNodeId":434}],"outputChains":[],"entryChains":[],"inputChains":[]},{"className":"wcNodeProcessGameCanMove","id":402,"name":"","color":"#007ACC","pos":{"x":-868.8209543581586,"y":106.2900928519008},"breakpoint":false,"properties":[{"name":"enabled","initialValue":true},{"name":"direction","initialValue":"left"}],"exitChains":[{"inName":"in","inNodeId":403,"outName":"yes","outNodeId":402},{"inName":"in","inNodeId":404,"outName":"no","outNodeId":402}],"outputChains":[],"entryChains":[],"inputChains":[]},{"className":"wcNodeProcessGameMove","id":403,"name":"","color":"#007ACC","pos":{"x":-935.4689481257423,"y":264.93391108080647},"breakpoint":false,"properties":[{"name":"enabled","initialValue":true},{"name":"direction","initialValue":"left"}],"exitChains":[{"inName":"in","inNodeId":433,"outName":"out","outNodeId":403}],"outputChains":[],"entryChains":[],"inputChains":[]},{"className":"wcNodeProcessGameCanMove","id":404,"name":"","color":"#007ACC","pos":{"x":-740.1737673393457,"y":268.895251422034},"breakpoint":false,"properties":[{"name":"enabled","initialValue":true},{"name":"direction","initialValue":"forward"}],"exitChains":[{"inName":"in","inNodeId":405,"outName":"yes","outNodeId":404},{"inName":"in","inNodeId":407,"outName":"no","outNodeId":404}],"outputChains":[],"entryChains":[],"inputChains":[]},{"className":"wcNodeProcessGameMove","id":405,"name":"","color":"#007ACC","pos":{"x":-832.4132223022605,"y":423.967745726017},"breakpoint":false,"properties":[{"name":"enabled","initialValue":true},{"name":"direction","initialValue":"forward"}],"exitChains":[{"inName":"in","inNodeId":433,"outName":"out","outNodeId":405}],"outputChains":[],"entryChains":[],"inputChains":[]},{"className":"wcNodeProcessGameMove","id":406,"name":"","color":"#007ACC","pos":{"x":-704.0418601826964,"y":586.7386962964015},"breakpoint":false,"properties":[{"name":"enabled","initialValue":true},{"name":"direction","initialValue":"right"}],"exitChains":[{"inName":"in","inNodeId":433,"outName":"out","outNodeId":406}],"outputChains":[],"entryChains":[],"inputChains":[]},{"className":"wcNodeProcessGameCanMove","id":407,"name":"","color":"#007ACC","pos":{"x":-613.0261157308875,"y":426.33223919104563},"breakpoint":false,"properties":[{"name":"enabled","initialValue":true},{"name":"direction","initialValue":"right"}],"exitChains":[{"inName":"in","inNodeId":406,"outName":"yes","outNodeId":407},{"inName":"in","inNodeId":408,"outName":"no","outNodeId":407}],"outputChains":[],"entryChains":[],"inputChains":[]},{"className":"wcNodeProcessGameMove","id":408,"name":"","color":"#007ACC","pos":{"x":-511.07473942452066,"y":588.4750656037895},"breakpoint":false,"properties":[{"name":"enabled","initialValue":true},{"name":"direction","initialValue":"backward"}],"exitChains":[{"inName":"in","inNodeId":433,"outName":"out","outNodeId":408}],"outputChains":[],"entryChains":[],"inputChains":[]}]}');

  // Start execution of the script.
  myPlay.start();

  // Create an instance of our script editor.
  var myPlayEditor = new wcPlayEditor('.playContainer', {
    readOnly: false
  });

  // Assign the current Play script to be rendered.
  myPlayEditor.engine(myPlay);

  myPlayEditor.onBeforeLoad(function() {
    console.log('onBeforeLoad');
  });

  myPlayEditor.onLoaded(function() {
    console.log('onLoaded');
  });

  myPlayEditor.onBeforeSave(function() {
    console.log('onBeforeSave');
  });

  myPlayEditor.onSaved(function() {
    console.log('onSaved');
  });

  myPlayEditor.onBeforeImport(function() {
    console.log('onBeforeImport');
  });

  myPlayEditor.onImported(function() {
    console.log('onImported');
  });

  var isModified = false;
  setInterval(function() {
    if (isModified !== myPlayEditor.isModified()) {
      isModified = myPlayEditor.isModified();
      document.title = 'wcPlay (Web Cabin)' + (isModified? '*': '');
    }
  }, 100);


  // Now initialize our little demo game view, using CraftyJS
  var $game = $('.game');

  // Our slide component - listens for slide events
  // and smoothly slides to another tile location
  Crafty.c("Slide", {
    init: function() {
      this._stepFrames = 5;
      this._tileSize = 32;
      this._moving = false;
      this._vx = 0; this._destX = 0; this._sourceX = 0;
      this._vy = 0; this._destY = 0; this._sourceY = 0;
      this._frames = 0;
      this._hasWon = false;
      this._direction = 'south';

      function __getBackward(dir) {
        switch (dir) {
          case 'north': return 'south';
          case 'south': return 'north';
          case 'west':  return 'east';
          case 'east':  return 'west';
        }
      }

      function __getLeft(dir) {
        switch (dir) {
          case 'north': return 'west';
          case 'south': return 'east';
          case 'west':  return 'south';
          case 'east':  return 'north';
        }
      }

      function __getRight(dir) {
        switch (dir) {
          case 'north': return 'east';
          case 'south': return 'west';
          case 'west':  return 'north';
          case 'east':  return 'south';
        }
      }

      this.bind("Slide", function(dir) {
        // Don't continue to slide if we're already moving
        if(this._moving) return false;
        this._moving = true;

        var direction = [0,0];
        switch (dir) {
          case 'forward':  dir = this._direction;                break;
          case 'backward': dir = __getBackward(this._direction); break;
          case 'left':     dir = __getLeft(this._direction);     break;
          case 'right':    dir = __getRight(this._direction);    break;
          default:
        }

        switch (dir) {
          case 'north': direction = [0,-1]; break;
          case 'south': direction = [0,1];  break;
          case 'west':  direction = [-1,0]; break;
          case 'east':  direction = [1,0];  break;
        }

        // Let's keep our pre-movement location
        // Hey, Maybe we'll need it later :)
        this._sourceX = this.x;
        this._sourceY = this.y;

        // Figure out our destination
        this._destX = this.x + direction[0] * 32;
        this._destY = this.y + direction[1] * 32;

        // Get our x and y velocity
        this._vx = direction[0] * this._tileSize / this._stepFrames;
        this._vy = direction[1] * this._tileSize / this._stepFrames;

        if (this._direction !== dir) {
          this.removeComponent('hero' + this._direction);
          this._direction = dir;
          this.addComponent('hero' + this._direction);
        }

        this._frames = this._stepFrames;
      }).bind("EnterFrame", function(e) {
        if(!this._moving) return false;

        // If we're moving, update our position by our per-frame velocity
        this.x += this._vx;
        this.y += this._vy;
        this._frames--;

        if(this._frames == 0) {
          // If we've run out of frames,
          // move us to our destination to avoid rounding errors.
          this._moving = false;
          this.x = this._destX;
          this.y = this._destY;
        }
        this.trigger('Moved', {x: this.x, y: this.y});
      }).bind("OpenDirections", function(directions) {
        function c(v) {
          return Math.floor(Math.max(0, v));
        }
        directions.north = level[c(this.y/this._tileSize-1)][c(this.x/this._tileSize)];
        directions.south = level[c(this.y/this._tileSize+1)][c(this.x/this._tileSize)];
        directions.west  = level[c(this.y/this._tileSize)][c(this.x/this._tileSize-1)];
        directions.east  = level[c(this.y/this._tileSize)][c(this.x/this._tileSize+1)];

        directions.forward = directions[this._direction];
        directions.backward= directions[__getBackward(this._direction)];
        directions.left    = directions[__getLeft(this._direction)];
        directions.right   = directions[__getRight(this._direction)];
      });
    },

    slideFrames: function(frames) { 
       this._stepFrames = frames;
    },

    // A function we'll use later to 
    // cancel our movement and send us back to where we started
    cancelSlide: function() {
      this.x = this._sourceX;
      this.y = this._sourceY;
      this._moving = false;
    }
  });

  Crafty.c("Camera", {
    init: function() {},
    camera: function(obj) {
      this.set(obj);
      var self = this;
      obj.bind("Moved", function(location) {
        self.set(location);
      });
    },
    set: function(obj) {
      Crafty.viewport.x = -obj.x + Crafty.viewport.width / 2;
      Crafty.viewport.y = -obj.y + Crafty.viewport.height / 2;
    }
  });

  var mapData =
"																						\n\
	F	F	F	F	F		F	F	F	F	F	F	F	F	F	F	F	F	F	F	F	\n\
	F						F														F	\n\
	F		F	F	F	F	F				F	F	F	F	F						F	\n\
	F				F	F	F				F	F	F	F	F						F	\n\
	F				F	F	F		F	F	F	F	F	F	F						F	\n\
	F				F				F		F	F	F	F	F						F	\n\
	F	F	F	F	F	F	F	F	F		F	F	F	F	F						F	\n\
	F		F	F	F				F						F						F	\n\
	F		F	F	F		F	F	F	F	F	F	F		F	F	F	F	F		F	\n\
					F								F		F	F	F	F	F		F	\n\
	F	F	F	F	F		F	F	F	F	F		F		F	F	F	F	F		F	\n\
	F	F	F	F	F		F	F	F	F	F		F		F	F	F	F	F			\n\
	F	F	F	F	F		F	F	F	F	F		F		F	F	F	F	F		F	\n\
	F	F	F	F	F		F				F										F	\n\
	F	F	F	F	F	F	F	F	F		F	F	F	F	F	F	F	F	G		F	\n\
	F										F	F	F	F	F						F	\n\
	F	F	F		F	F	F	F	F		F	F	F	F	F	F	F	F	F		F	\n\
	F		F		F	F	F	F	F		F	F	F	F	F		F	F	F		F	\n\
	F		F		F	F	F	F	F		F	F	F	F	F		F	F	F		F	\n\
			F		F		F						F								F	\n\
	F	F	F	F	F		F	F	F	F	F		F	F	F	F	F	F	F		F	\n\
	F	F	F	F	F		F	F	F	F	F								F		F	\n\
	F	F	F	F	F		F	F	F	F	F		F	F	F	F	F	F	F		F	\n\
	F	F	F	F	F						F		F	F	F	F	F				F	\n\
	F	F	F	F	F	F	F				F		F	F	F	F	F				F	\n\
							F				F										F	\n\
	F	F	F	F	F	F	F				F	F	F	F	F	F	F	F	F	F	F	\n\
																						";
  var level = [];
  var assets = {
    sprites: {
      "dungeon.png": {
        tile: 32,
        tileh: 32,
        map: {
          floor: [0, 1],
          wall: [17, 0],
          goal: [3, 1]
        }
      },
      "characters.png": {
        tile: 32,
        tileh: 32,
        map: {
          heronorth: [0, 3],
          herosouth: [0, 0],
          heroeast:  [0, 2],
          herowest:  [0, 1]
        }
      }
    }
  };

  Crafty.paths({images: "Demo/"});

  //the loading screen that will display while our assets load
  Crafty.scene("loading", function() {
    Crafty.load(assets, function() {
      Crafty.scene("main"); //when everything is loaded, run the main scene
    });
  });
 
  Crafty.scene("main", function() {
    Crafty.background("#FFF");

    // Split out each row
    $.each(mapData.split("\n"), function(y, row) {
      var columns = row.split("\t");
      level.push(columns);
      // Then split out each column
      $.each(columns, function(x, column) {
        if(column === 'F') {
          Crafty.e("2D, Canvas, floor, Floor").attr({x:x*32, y:y*32});
        } else if (column === 'G') {
          Crafty.e("2D, Canvas, goal, Goal").attr({x:x*32, y:y*32});
        } else {
          Crafty.e("2D, Canvas, wall, Wall").attr({x:x*32, y:y*32});
        }
      });
    });

    var player = Crafty.e("2D, Canvas, PlayerControls, Slide, herosouth").attr({x:21*32, y:13*32});
    var camera = Crafty.e("Camera").camera(player);

    player.addComponent("Collision").onHit("Wall", function(obj) {
      this.cancelSlide();
    }).onHit("Goal", function(obj) {
      // Win condition.
      if (!this._hasWon) {
        this._hasWon = true;
        myPlay.triggerEvent('Remote Event', 'Goal');
      }
    });
  });

  Crafty.scene("loading");
  Crafty.init($game.width(), $game.height(), $game[0]).canvas.init();
});