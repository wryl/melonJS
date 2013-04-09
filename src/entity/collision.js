/*
 * MelonJS Game Engine
 * Copyright (C) 2011 - 2013, Olivier BIOT, Jason Oster
 * http://www.melonjs.org
 *
 */


/**
 * A singleton for managing collision detection.
 * @final
 * @memberOf me
 * @constructor Should not be called by the user.
 */
me.collision = (function() {

    // Hold public stuff inside the singleton
    var api = {};

    // Collision types
    api.types = {
        NO_OBJECT : 0,

        /**
         * Default object type constant.<br>
         * See type property of the returned collision vector.
         * @constant
         * @name me.collision.types#ENEMY_OBJECT
         */
        ENEMY_OBJECT : 1,

        /**
         * Default object type constant.<br>
         * See type property of the returned collision vector.
         * @constant
         * @name me.collision.types#COLLECTABLE_OBJECT
         */
        COLLECTABLE_OBJECT : 2,

        /**
         * Default object type constant.<br>
         * See type property of the returned collision vector.
         * @constant
         * @name me.collision.types#ACTION_OBJECT
         */
        ACTION_OBJECT : 3 // door, etc...
    };

    // Spacial grid
    var grid = [];
    var objectCount = 0;

    /**
     * Width of a cell in the collision spacial grid<br>
     * @public
     * @type {Number}
     * @name me.collision#gridwidth
     */
    (Object.defineProperty(api, "gridwidth", {
        get : function() {
            var layer = me.game.collisionMap;
            return (
                me.game.currentLevel.gridwidth ||
                me.sys.collisionGridWidth ||
                (layer && (layer.tilewidth * 2)) ||
                128
            );
        }
    }));

    /**
     * Height of a cell in the collision spacial grid<br>
     * @public
     * @type {Number}
     * @name me.collision#gridheight
     */
    (Object.defineProperty(api, "gridheight", {
        get : function() {
            var layer = me.game.collisionMap;
            return (
                me.game.currentLevel.gridheight ||
                me.sys.collisionGridHeight ||
                (layer && (layer.tileheight * 2)) ||
                128
            );
        }
    }));

    /**
     * Width of collision spacial grid<br>
     * @public
     * @type {Number}
     * @name me.collision#cols
     */
    (Object.defineProperty(api, "cols", {
        get : function() {
            var layer = me.game.collisionMap || me.game.currentLevel;
            return Math.ceil(layer.width / api.gridwidth);
        }
    }));

    /**
     * Height of collision spacial grid<br>
     * @public
     * @type {Number}
     * @name me.collision#rows
     */
    (Object.defineProperty(api, "rows", {
        get : function() {
            var layer = me.game.collisionMap || me.game.currentLevel;
            return Math.ceil(layer.height / api.gridheight);
        }
    }));

    /**
     * Reset the spacial grid.<br>
     * @name me.collision#reset
     * @protected
     * @function
     */
    api.reset = function () {
        // Remove objects from old grid
        // TODO: Verify this is necessary
        for (var x = 0; x < grid.length; x++) {
            for (var y = 0; y < grid[x].length; y++) {
                while (grid[x][y].objects.length) {
                    var obj = grid[x][y].objects[0];
                    if (obj._collision)
                        api.removeFrom(obj, x, y, x + 1, y + 1);
                    else
                        grid[x][y].objects.shift();
                }
            }
        }

        // Reset object counter
        objectCount = 0;

        var cols = api.cols;
        var rows = api.rows;
        var gridwidth = api.gridwidth;
        var gridheight = api.gridheight;

        // Create new empty grid
        grid = [];
        for (var x = 0; x < cols; x++) {
            grid[x] = [];
            for (var y = 0; y < rows; y++) {
                grid[x][y] = new me.Rect(
                    new me.Vector2d(x * gridwidth, y * gridheight),
                    gridwidth,
                    gridheight
                );
                grid[x][y].objects = []; // TODO: Use Object instead?
            }
        }
    };

    /**
     * Populate the spacial grid after a level has loaded.<br>
     * @name me.collision#onLevelLoaded
     * @private
     * @function
     */
    api.onLevelLoaded = function () {
        var layer = me.game.collisionMap;
        if (!layer)
            return;

        var cols = layer.cols;
        var rows = layer.rows;
        var gridwidth = api.gridwidth;
        var gridheight = api.gridheight;

        // Populate grid with me.Tile objects
        for (var x = 0; x < cols; x++) {
            for (var y = 0; y < rows; y++) {
                var tile = layer.layerData[x][y];
                if (!tile)
                    continue;

                var tileset = layer.tilesets.getTilesetByGid(
                    tile.tileId
                );
                var props = tileset.getTileProperties(tile.tileId);

                if (props.isCollidable) {
                    // Set collision mask for tile
                    tile.collisionMask = (
                        typeof(props.collisionmask) !== "undefined" ?
                        props.collisionmask : 0xFFFFFFFF
                    );

                    api.add(tile);
                }
            }
        }
    };

    /**
     * Add an object to the spacial grid.<br>
     * @name me.collision#add
     * @public
     * @function
     * @param {me.ObjectEntity} obj Object to be added
     */
    api.add = function (obj) {
        objectCount++;

        var cols = api.cols;
        var rows = api.rows;
        var gridwidth = api.gridwidth;
        var gridheight = api.gridheight;

        // Add doubly-linked list
        api.addTo(
            obj,
            // TODO: Support floating objects
            (~~(obj.left / gridwidth)).clamp(0, cols),
            (~~(obj.top / gridheight)).clamp(0, rows),
            Math.ceil(obj.right / gridwidth).clamp(0, cols),
            Math.ceil(obj.bottom / gridheight).clamp(0, rows)
        );
    };

    /**
     * Remove an object from the spacial grid.<br>
     * @name me.collision#remove
     * @public
     * @function
     * @param {me.ObjectEntity} obj Object to be removed
     */
    api.remove = function (obj) {
        objectCount--;

        var cols = api.cols;
        var rows = api.rows;
        var gridwidth = api.gridwidth;
        var gridheight = api.gridheight;

        // Remove doubly-linked list
        api.removeFrom(
            obj,
            // TODO: Support floating objects
            (~~(obj.left / gridwidth)).clamp(0, cols),
            (~~(obj.top / gridheight)).clamp(0, rows),
            Math.ceil(obj.right / gridwidth).clamp(0, cols),
            Math.ceil(obj.bottom / gridheight).clamp(0, rows)
        );
    };

    /**
     * Add an object to the spacial grid in the specified positions.<br>
     * @name me.collision#addTo
     * @rivate
     * @function
     * @param {me.ObjectEntity} obj Object to be added
     * @param {Number} start_x Start position X-axis
     * @param {Number} start_y Start position Y-axis
     * @param {Number} end_x End position X-axis
     * @param {Number} end_y End position Y-axis
     */
    api.addTo = function (obj, start_x, start_y, end_x, end_y) {
        objectCount++;

        for (var x = start_x; x < end_x; x++) {
            for (var y = start_y; y < end_y; y++) {
                var cell = grid[x][y];

                obj._collision.cells.push(cell);
                cell.objects.push(obj);
            }
        }
    };

    /**
     * Remove an object from the spacial grid in the specified positions.<br>
     * @name me.collision#removeFrom
     * @rivate
     * @function
     * @param {me.ObjectEntity} obj Object to be removed
     * @param {Number} start_x Start position X-axis
     * @param {Number} start_y Start position Y-axis
     * @param {Number} end_x End position X-axis
     * @param {Number} end_y End position Y-axis
     */
    api.removeFrom = function (obj, start_x, start_y, end_x, end_y) {
        objectCount--;

        obj._collision.cells = [];

        for (var x = start_x; x < end_x; x++) {
            for (var y = start_y; y < end_y; y++) {
                grid[x][y].objects.remove(obj);
            }
        }
    };

    /**
     * Update an object's position within the spacial grid.<br>
     * @name me.collision#updateMovement
     * @public
     * @function
     * @param {me.ObjectEntity} obj Object to be updated
     */
    api.updateMovement = function (obj) {
        /* Broad phase */
        // TODO: Support floating objects

        // Calculate position within spacial grid
        var range = obj._collision.range;
        var cols = api.cols;
        var rows = api.rows;
        var gridwidth = api.gridwidth;
        var gridheight = api.gridheight;

        // Hash current position within spacial grid
        var hash =
            (~~(range.left / gridwidth)).clamp(0, cols) + "," +
            (~~(range.top / gridheight)).clamp(0, rows) + "," +
            Math.ceil(range.right / gridwidth).clamp(0, cols) + "," +
            Math.ceil(range.bottom / gridheight).clamp(0, rows);

        // Check if grid needs to be updated
        if (obj._collision.hash !== hash) {
            // Remove from original spacial grid cells
            if (obj._collision.cells.length) {
                var removeArgs = obj._collision.hash.split(",").map(
                    function (i) {
                        return +i;
                    }
                );
                removeArgs.unshift(obj);
                api.removeFrom.apply(api, removeArgs);
            }

            // Update hash
            obj._collision.hash = hash;

            var args = hash.split(",").map(
                function (i) {
                    return +i;
                }
            );
            // Add to new spacial grid cells
            args.unshift(obj);
            api.addTo.apply(api, args);
        }
    };

    /**
     * Perform collision detection for a given object.<br>
     * @name me.collision#check
     * @private
     * @function
     * @param {me.ObjectEntity} objA Object to be tested for collisions
     * @return {Object[]} Array of {me.ObjectEntity} or {me.Tile} that *may* collide
     */
    api.check = function (objA) {

        /* Narrow phase */
        var result = [];

        // Iterate each collision cell
        for (var i = 0; i < objA._collision.cells.length; i++) {
            var objects = objA._collision.cells[i].objects;

            for (var j = 0; j < objects.length; j++) {
                var objB = objects[j];

                // FIXME: Also skip objects that have already collided in a
                // previous call to me.collision.check()

                // Skip this object
                if (objA === objB ||
                    // And masked objects
                    (objA.collisionMask & objB.collisionMask) === 0 ||
                    // And previously handled objects
                    result.indexOf(objB) >= 0 ||
                    // And objects that fail the AABB test
                    !objA._collision.range.overlaps(objB._collision.range)) {

                    continue;
                }

                // Record collision
                result.push(objB);

                // Notify objA of collision with objB
                var depth = api.calcResponse(objA, objB);
                if (objA.onCollision(objB, depth) !== false)
                    objA.vel.add(depth); // Apply response

                // Notify objB of collision with objA
                if (objB.onCollision && objB.onCollision(objA, depth) !== false)
                    objB.vel.add(depth); // Apply response
            }
        }

        return result;
    };

    /**
     * Returns the number of objects considered for collision per frame<br>
     * @name me.collision#getObjectCount
     * @protected
     * @function
     * @return {Number} total number of objects in the collision spacial grid
     */
    api.getObjectCount = function() {
        return objectCount;
    };

    /**
     * Calculate the collision response colliding objects<br>
     * @name me.collision#calcResponse
     * @private
     * @function
     * @param {me.Rect} objA First object
     * @param {me.Rect} objA Second object
     * @return {me.Vector2d} A vector describing how the objects collide
     * @example
     * var depth = me.collision.calcResponse(objA, objB, objA.vel);
     * if (Math.abs(depth.x) > Math.abs(depth.y)) {
     *     if (depth.x < 0) {
     *         // Collision at the left
     *     }
     *     else {
     *         // Collision at the right
     *     }
     * }
     * else if (depth.y < 0) {
     *     // Collision at the top
     * }
     * else {
     *     // Collision at the bottom
     * }
     */
    api.calcResponse = function (objA, objB) {
        // TODO: Check with different-sized objects

        // FIXME: Don't modify the velocity here!
        // I need to modify it in order to get an accurate penetration depth.
        // But I also need to get the penetration depth to be passed into the
        // onCollision handler.
        // The onCollision handler may return false to PREVENT ALL
        // COLLISION RESPONSE!

        // Simple AABB bounds checking
        var colBox = objA.collisionBox;
        if ((~~colBox.bottom === ~~objB.top && objA.vel.y > 0) ||
            (~~colBox.top === ~~objB.bottom && objA.vel.y < 0)) {

            // FIXME: Causes false positives when jumping against a wall

            // Reset falling flag
            if (objA.vel.y > 0)
                objA.falling = false;

            objA.vel.y = 0;
        }
        else if (
            (~~colBox.right === ~~objB.left && objA.vel.x > 0) ||
            (~~colBox.left === ~~objB.right && objA.vel.x < 0)) {

            objA.vel.x = 0;
        }

        // If objA has stopped moving, we're done!
        if (objA.vel.x === 0 && objA.vel.y === 0)
            return objA.vel;

        // Get AABB penetration depth
        var range = objA._collision.range;
        var x = (objA.vel.x < 0) ?
            (objB.right - range.left) : // Moving left
            (objB.left - range.right);  // Moving right

        var y = (objA.vel.y < 0) ?
            (objB.bottom - range.top) : // Moving up
            (objB.top - range.bottom);  // Moving down

        // Use the minimum distance (toward zero)
        x = Math.abs(x) < Math.abs(objA.vel.x) ? x : 0;
        y = Math.abs(y) < Math.abs(objA.vel.y) ? y : 0;

        return new me.Vector2d(x, y);
    };

    /**
     * Draw collision detection spacial grid (for debugging).<br>
     * @name me.collision#draw
     * @protected
     * @function
     * @param {Context2d} context Destination canvas context
     */
    api.draw = function (context) {
        var gridwidth = api.gridwidth;
        var gridheight = api.gridheight;

        // Setup context
        context.fillStyle = "red";

        var start = new me.Vector2d(
            Math.max(me.game.viewport.left / gridwidth, 0),
            Math.max(me.game.viewport.top / gridheight, 0)
        ).floorSelf();

        var end = new me.Vector2d(
            Math.min(me.game.viewport.right / gridwidth, api.cols),
            Math.min(me.game.viewport.bottom / gridheight, api.rows)
        ).ceilSelf();

        for (var x = start.x, dx = x * gridwidth; x < end.x; x++) {
            for (var y = start.y, dy = y * gridheight; y < end.y; y++) {
                // Opacity is based on number of objects in the cell
                context.globalAlpha = (grid[x][y].objects.length / 16).clamp(0, 0.9);

                context.fillRect(dx, dy, gridwidth, gridheight);
                dy += gridwidth;
            }
            dx += gridheight;
        }

        // Reset context
        context.globalAlpha = 1;
    };

    // Return public API
    return api;
})();

// Reset the collision detection engine when a new level is loaded
me.event.subscribe(me.event.LEVEL_LOADED, me.collision.onLevelLoaded);
