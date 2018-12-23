( function ( name ) {
    "use strict";
    /**
     * Find the first ancestor of el where callback returns true.
     * Returns the root element 
     * or null if nothing found before reaching untilEl 
     * or document if untilEl not provided.
     * @param {object} el 
     * @param {callable} callback 
     * @param {object} untilEl 
     */
    function root( el, callback, untilEl ) {
        if ( el === ( untilEl || document ) ) {
            return null;
        }
        return callback( el ) ? el : (
            el && root(
                el.parentNode, callback, untilEl
            )
        );
    }

    /**
     * Check if mouse is directly above passed element.
     * @param {object} el Target element
     * @param {int} x mouseEvent.clientX
     * @param {int} y mouseEvent.clientY
     * @returns {bool}
     */
    function isAbove( el, x, y ) {
        const box = el.getBoundingClientRect();
        return x > box.left &&
            x < ( box.left + box.width ) &&
            y > box.top &&
            y < ( box.top + box.height );
    }

    /**
     * Prevent text selecting while dragging
     * @param {object} e 
     */
    function disableSelect( e ) {
        e.preventDefault();
    }

    /**
     * Add or remove css class from node elem
     * @param {object} el 
     * @param {string} className 
     * @param {bool} isAdd pass true if adding
     */
    function addRemoveClass( el, className, isAdd ) {
        const names = el.className.split( " " );
        const i = names.indexOf( className );
        if ( i < 0 && isAdd ) {
            // add only if not yet there
            el.className = `${el.className} ${className}`.trim();
        } else if ( i > -1 && !isAdd ) {
            names.splice( i, 1 );
            el.className = names.join( " " );
        }
    }

    /**
     * Return element dimentions without padding and border
     * @param {object} el 
     * @return {object}
     */
    function getDimensions( el ) {
        const box = el.getBoundingClientRect();
        const comp = window.getComputedStyle( el );
        return {
            h: box.height -
                parseFloat( comp.paddingTop ) -
                parseFloat( comp.paddingBottom ) -
                parseFloat( comp.borderTopWidth ) -
                parseFloat( comp.borderBottomWidth ),
            w: box.width -
                parseFloat( comp.paddingLeft ) -
                parseFloat( comp.paddingRight ) -
                parseFloat( comp.borderLeftWidth ) -
                parseFloat( comp.borderRightWidth ),
        };
    }

    function decorateDraggedElem( elem ) {
        const dim = getDimensions( elem );
        elem.style.width = dim.w + "px";
        elem.style.height = dim.h + "px";
        return dim;
    }

    /**
     * Returns true if it is a DOM element 
     * */
    function isElement( o ) {
        return (
            typeof HTMLElement === "object" ? o instanceof HTMLElement : //DOM2
            o && typeof o === "object" && o !== null && o.nodeType === 1 && typeof o.nodeName === "string"
        );
    }
    /**
     * Debounce handler for dragged marker
     */
    const debounceHandler = ( function () {
        let t = null;
        return function ( fn, ms ) {
            clearTimeout( t );
            t = setTimeout( fn, ms );
        };
    } )();

    class _ {
        constructor( container, options ) {
            if ( !container ||
                !isElement( container ) ) {
                throw "Container not found";
            }

            const OPTS = options || {};
            if ( !OPTS.elemSelector ||
                typeof OPTS.elemSelector !== "string"
            ) {
                throw "options.elemSelector not found";
            }

            this.container = container;
            // First elem in the hierarchy
            this.elemSelector = OPTS.elemSelector;
            // Check if user has defined handling selector 
            // inside the draggable element. 
            // If yes and elem has been found 
            // then use it to initiate the process. 
            // Otherwise use elemSelector elem. 
            this.handlerSelector = OPTS.handlerElemSelector || this.elemSelector;

            // drop indicator
            this.customMarkerFunc = OPTS.customMarkerFunc || null;
            this.onDropFunc = OPTS.onDropFunc || null;
            this.onBeforeDragFunc = OPTS.onBeforeDragFunc || null;

            this.isDraggedClass = OPTS.isDraggedClass || "is-dragged";
            this.hasDraggedClass = OPTS.hasDraggedClass || "has-dragged";
            this.swapTargetClass = OPTS.swapTargetClass || "swap-target";
            this.targetContainerClass = typeof OPTS.targetContainerClass === "string" ?
                OPTS.targetContainerClass :
                "is-target";
            // is it new container?
            this.isSwap = OPTS.hasOwnProperty( "isSwap" ) ?
                OPTS.isSwap === true : false;

            this.useCSSTranslate = OPTS.hasOwnProperty( "useCSSTranslate" ) ?
                OPTS.useCSSTranslate === true : true;

            this.moveElem = this.useCSSTranslate ?
                this.translateElem : this.dragElem;
            /**
             * The last element beign swapped or moved up/down.
             * This property is reset every mouseup event.
             * Used in both scenarios for isSwap: true and false.
             */
            this.lastSwapElem = null;

            // Check debounce rate. It does not make sense to have 
            // debounce les than 20 ms
            this.debounceMs = OPTS.hasOwnProperty( "debounceMs" ) ?
                ( OPTS.debounceMs > 20 ?
                    OPTS.debounceMs :
                    0 ) :
                0;
            // Decide whether debouncing 
            // while dragging is needed
            this.dragListener = this.debounceMs ?
                this.debouncedDrag.bind( this ) :
                this.drag.bind( this );
            this.mouseupListener = this.oneMouseupHandler.bind( this );

            this.initX; // Initial mouse click X offset
            this.initY; // Initial mouse click Y offset
            this.linked = []; // linked _s

            // Elem used to mark target where
            this.marker = null; // the elem will be dropped
            this.isActive = false; // Was initialised ?
            this.dragStarted = false; // Was moved?
            // Current dragged list element
            this.draggedElem = null; // The one glued to mouse
            this.isJump = false; // is new container

            /**
             * Attach initialisation event to the container.
             * The event will start dragging procedure.
             */
            this.container.addEventListener( "mousedown", e => {
                e.preventDefault();

                // First resolve draggedElem 
                // and then call mousedownHandler.
                if ( e.button !== 0 ) {
                    // ignore everything except left mouse click
                    return;
                }

                // Check if handlerSelector was specified
                const any = this.handlerSelector === this.elemSelector;

                // Find handler - element that alows dragging
                if ( !any && e.target.matches( this.handlerSelector ) ) {
                    // Only specific element can be used as handler.
                    // Check if matched e.target is inside of the draggable element.
                    this.draggedElem = root(
                        e.target,
                        el => el.matches( this.elemSelector ),
                        this.container
                    );

                    if ( !this.draggedElem ) {
                        throw `Check your configuration; handlerSelector error not found in the container.`;
                    }
                    this.mousedownHandler( e );
                    return;
                }

                if ( any ) { // Any element alowed
                    this.draggedElem = root(
                        e.target,
                        el => el.matches( this.elemSelector ),
                        this.container
                    );
                    if ( !this.draggedElem ) {
                        // not found
                        return;
                    }
                    this.mousedownHandler( e );
                }
            } );
        }
        /**
         * On drop controller function.
         * MouseupListener gets attached 
         * to window as listener every time 
         * user click is recived and starts 
         * the process in mousedownHandler.
         * 
         * The method is bind to instance 
         * property mouseupListener
         * as a reference for removeEventListener
         * called at the end of the process.
         * @param {object} e 
         */
        oneMouseupHandler( e ) {
            e.preventDefault();
            // is Active === on mousedown triggered
            if ( this.isActive ) {
                if ( this.onDropFunc !== null && this.dragStarted ) {
                    // Securely deal with 
                    // user supplied 
                    // callbacks.
                    try {
                        this.onDropFunc(
                            this.draggedElem,
                            this.container,
                            this.lastSwapElem
                        );
                    } catch ( error ) {
                        console.exception( "onDropFunc callback exception:", error );
                    }
                }

                this.reset();

            }
            // unbind the event
            e.target.removeEventListener( e.type, this.mouseupListener );
        }

        /**
         * Actual handler
         * @param {object} e 
         */
        mousedownHandler( e ) {
            // Run client user provided callback 
            if ( this.onBeforeDragFunc !== null ) {
                try {
                    this.onBeforeDragFunc( this.draggedElem );
                } catch ( error ) {
                    console.exception( "onBeforeDragFunc exception: ", error );
                }
            }

            // Make reset action an event listener.
            // Removes dragger and disableSelect events
            // from window when mouse released. 
            // It will stop dragging 
            // and reorder/swap elems in the target list.
            // It will remove itself from its target 
            // once called for the first time.
            window.addEventListener( "mouseup", this.mouseupListener, false );

            // Initial click offset.
            this.initX = this.draggedElem.offsetLeft - e.clientX;
            this.initY = this.draggedElem.offsetTop - e.clientY;


            // Get drop area element/placeholder
            this.marker = this.getMarker();

            addRemoveClass(
                this.draggedElem,
                "is-raised",
                true
            );

            // Flash target containers
            this.markTargetContainers( true );

            // Add listeners:
            // disable selecting while dragging
            window.addEventListener(
                "selectstart",
                disableSelect,
                false
            );

            // Our main dragging event 
            // waiting for mouse movement.
            window.addEventListener(
                "mousemove",
                this.dragListener,
                false
            );

            // Mark as active
            this.isActive = true;
        }
        /**
         * Reset user interface:
         * Drop the moved element in the new place,
         * reset css classes and styles,
         * remove temporary event listeners (mousemove and text select),
         * Reset controll variables.
         */
        reset() {
            // Check if user actually moved the elem
            // dragStarted = true in mousemove
            if ( this.dragStarted ) {
                let tc = this.marker.parentNode;
                // add to the list at the new position
                tc.insertBefore(
                    this.draggedElem,
                    this.marker
                );
                tc.removeChild( this.marker );

                // Clear style after draggedElem has been moved
                if ( this.useCSSTranslate ) {
                    this.draggedElem.style.transform = "";
                }

                this.draggedElem.style.left = "";
                this.draggedElem.style.top = "";

                this.draggedElem.style.position = "";
            }

            // Clear css classes
            addRemoveClass(
                this.draggedElem,
                "is-raised",
                false
            );
            addRemoveClass(
                this.draggedElem,
                this.isDraggedClass,
                false
            );
            addRemoveClass(
                this.container,
                this.hasDraggedClass,
                false
            );
            if ( this.lastSwapElem !== null ) {
                addRemoveClass(
                    this.lastSwapElem,
                    this.swapTargetClass,
                    false
                );
            }

            // Unflash target containers
            this.markTargetContainers( false );
            // Remove listeners
            window.removeEventListener(
                "mousemove",
                this.dragListener,
                false
            );
            window.removeEventListener(
                "selectstart",
                disableSelect,
                false
            );

            this.lastSwapElem = null;
            this.isActive = false;
            this.dragStarted = false;
            this.draggedElem = null;
            this.marker = null;
        }

        /**
         * Set linked containers
         * @param {array} list 
         */
        setlinked( list ) {
            this.linked = list.filter(
                l => l !== this && l.isSwap === this.isSwap
            );
        }
        /**
         * Initialisation for move up/down and swap
         * mousemove event.
         */
        onDragStart( e ) {
            e.preventDefault();
            if ( this.dragStarted ) {
                // we are already moving
                return this;
            }
            // Yes, we have actually moved.
            this.dragStarted = true;

            // Its time to make the dragged element 
            // follow the mouse and move marker into 
            // the empty place.
            this.moveMarker(
                this.container,
                this.draggedElem
            );

            // Dragged element must be positioned absolutely
            this.draggedElem.style.position = "absolute";
            // And moved top/left 0 if translated
            if ( this.useCSSTranslate ) {
                this.draggedElem.style.top = "0";
                this.draggedElem.style.left = "0";
            }

            // apply user classes to the element that is dragged
            addRemoveClass(
                this.draggedElem,
                this.isDraggedClass,
                true
            );
            // and its container
            addRemoveClass(
                this.container,
                this.hasDraggedClass,
                true
            );
            return this;
        }

        /**
         * Event listener for drag action
         * @param {object} e 
         */
        drag( e ) {
            this.onDragStart( e )
                .moveElem(
                    this.initX + e.clientX,
                    this.initY + e.clientY
                )
                .markerHandler( 
                    e.clientX, 
                    e.clientY 
                );
        }

        /**
         * Event listener for debounced drag action
         * @param {object} e 
         */
        debouncedDrag( e ) {
            // Called exactly at the time of the event,
            // no debounce
            this.onDragStart( e )
                .moveElem(
                    this.initX + e.clientX,
                    this.initY + e.clientY
                );
            debounceHandler( () => {
                // Called after debounce ms
                this.markerHandler( e.clientX, e.clientY );
            }, this.debounceMs );
        }

        /**
         * Make the draggedElem follow the mouse
         * @param {object} e 
         */
        dragElem( newX, newY ) {
            this.draggedElem.style.left = newX + "px";
            this.draggedElem.style.top = newY + "px";

            return this;
        }
        /**
         * Make the draggedElem follow the mouse
         * using translate
         * @param {object} e 
         */
        translateElem( newX, newY ) {
            this.draggedElem
                .style
                .transform = `translate(${newX}px,${newY}px)`;

            return this;
        }

        /**
         * Move marker handler 
         * and reorder/swap target elems.
         * 
         * @param {int} eX event.clientX
         * @param {int} eY event.clientY
         */
        markerHandler( eX, eY ) {
            // Make sure it's still active.
            // Debounced handler could 
            // call this method after 
            // some references
            // are already removed.
            if ( this.isActive ) {
                const op = this.isSwap ?
                    ( tc, to ) => this.swapMarker( tc, to ) :
                    ( tc, to ) => this.moveMarker( tc, to );

                const pos = this.getMarkerPos( eX, eY );
                if ( pos.status ) {
                    op( pos.tc, pos.to );
                }
            }
        }

        getTargetContainer( eX, eY ) {
            this.isJump = false;
            // Check if we need to move the marker
            if ( isAbove( this.marker, eX, eY ) ) {
                // Not moved far
                return null;
            }
            // target container to drop the elem, start with the default
            var tc = this.container;

            // Check if it is still the same container
            if ( !isAbove( tc, eX, eY ) ) {
                // Moved outside or to another container.
                // Reset container. Null container will keep
                // marker in its position on mouse release.
                tc = null;
                for ( let cont of this.linked ) {
                    if ( isAbove( cont.container, eX, eY ) ) {
                        this.isJump = true;
                        tc = cont.container;
                        break;
                    }
                }

            }
            return tc;
        }

        /**
         * Add/remove class to target containers on drag start/end
         * @param {bool} isAdd 
         */
        markTargetContainers( isAdd ) {
            if ( this.targetContainerClass ) {
                this.linked.forEach( li => addRemoveClass(
                    li.container,
                    this.targetContainerClass,
                    isAdd
                ) );
            }
        }

        /**
         * Determine the container and the element begin hovered.
         * @param {int} eX 
         * @param {int} eY 
         * @param {function} onMove 
         */
        getMarkerPos( eX, eY ) {
            const tc = this.getTargetContainer( eX, eY );
            if ( tc === null ) {
                // No container, no moving marker
                return {
                    status: false,
                    tc: null,
                    to: null,
                };
            }
            // get children from target container
            const elems = tc.querySelectorAll( this.elemSelector );
            if ( !elems.length ) {
                // Empty container - 
                // attach to the end of the list.
                return {
                    status: true,
                    tc: tc,
                    to: null, // End of the list
                };
            }

            var to = null;
            // Find new place
            for ( let el of elems ) {
                // Ignore draggedElem and marker
                if ( el !== this.draggedElem &&
                    el !== this.marker &&
                    isAbove( el, eX, eY ) ) {
                    to = el;
                    break;
                }
            }

            if ( to === null ) {
                // If it's a container but mouse was released
                // outside any valid target, marker would jump
                // to the end of the container insted keeping
                // last position. 
                return {
                    status: false,
                    tc: null,
                    to: null,
                };
            }
            return {
                status: true,
                tc: tc,
                to: to,
            };
        }
        /**
         * Common functionality for moving and swapping.
         * Returning false will halt the execution in 
         * moving/swapping controller.
         * @param {object} tc 
         * @param {object} to 
         */
        beforeMove( tc, to ) {
            if ( this.marker === null ) {
                // Not this time, marker not set
                return false;
            }

            if ( to === null ) {
                // Move to the bottom of the container
                tc.insertBefore( this.marker, null );
                return false;
            }
            return true;
        }
        /**
         * Move marker controller when dragged element changes its target.
         * @param {object} tc wrapper
         * @param {object} to element to push up/down
         */
        moveMarker( tc, to ) {

            if ( !this.beforeMove( tc, to ) ) {
                return;
            }

            if ( this.lastSwapElem !== null ) {
                addRemoveClass(
                    this.lastSwapElem,
                    this.swapTargetClass,
                    false
                );
            }

            if ( to !== this.draggedElem ) {
                addRemoveClass(
                    to,
                    this.swapTargetClass,
                    true
                );
            }

            this.lastSwapElem = to;

            if ( to.nextElementSibling === this.marker ) {
                // If moving up
                tc.insertBefore(
                    this.marker, to
                );

                return;
            }

            // If moving marker down 
            // or is not there yet.
            tc.insertBefore(
                this.marker, to.nextElementSibling
            );
        }
        /**
         * Swapping controller
         * @param {object} tc wrapper
         * @param {object} to element to swap with
         */
        swapMarker( tc, to ) {

            if ( !this.beforeMove( tc, to ) ) {
                return;
            }

            // if swapping this.draggedElem is used to reverse 
            // the last change if required

            const isUp = to.nextElementSibling === this.marker;

            if ( this.lastSwapElem !== null ) {
                addRemoveClass(
                    this.lastSwapElem,
                    this.swapTargetClass,
                    false
                );
                // Reset previuos swap
                // only drop will change the the elems
                if ( this.lastSwapElem === to ) {
                    // Reverse this.lastSwapElem position using
                    // marker position to see where it was last time
                    const where = isUp ? this.marker : this.marker.nextElementSibling;
                    this.marker.parentNode.insertBefore(
                        this.lastSwapElem, where
                    );
                    // move marker elem back to draggedElem position
                    tc.insertBefore(
                        this.marker, this.draggedElem
                    );

                    // If reversing last swap and to elem
                    // and its direct swap then do not record it at all.
                    // As if it would not happened.
                    this.lastSwapElem = null;

                    return;

                } else {
                    // Reverse last using marker as the last position for reversed elem.
                    // Container of the last position of the marker is the target container.
                    const where = isUp ?
                        this.marker :
                        this.marker.nextElementSibling;

                    this.marker.parentNode.insertBefore(
                        this.lastSwapElem, where
                    );
                }
            }

            addRemoveClass(
                to,
                this.swapTargetClass,
                true
            );

            if ( isUp ) {
                // If moving up - swap marker

                tc.insertBefore(
                    this.marker, to
                );
                // swap elems
                this.container.insertBefore(
                    to, this.draggedElem
                );

                this.lastSwapElem = to;
                return;
            }

            // If moving marker use target container
            tc.insertBefore(
                this.marker, to.nextElementSibling
            );
            // swap elems: owning container 
            // is always the target
            this.container.insertBefore(
                to, this.draggedElem.nextElementSibling
            );

            this.lastSwapElem = to;

        }

        /**
         * Get marker element.
         * Marker will contain 
         * either original elem processed
         * by customMarkerFunc if set
         * or default dashed placeholder 
         * if customMarkerFunc not set.
         * @return {object}
         */
        getMarker() {
            // check if customMarkerFunc callback exists
            if ( typeof this.customMarkerFunc === "function" ) {
                // Securely deal with 
                // user supplied 
                // callbacks.
                try {
                    const cm = this.customMarkerFunc(
                        this.draggedElem.cloneNode( true )
                    );
                    if ( !isElement( cm ) ) {
                        throw `customMarkerFunc should return DOM element; ${typeof cm} returned instead.`;

                    }

                    return cm;
                } catch ( error ) {
                    console.exxception(
                        "Default marker used. Exception while dealing with custom marker:",
                        error
                    );
                }

            }

            const m = this.draggedElem.cloneNode();

                m.innerHTML = `<span 
                    style="margin:2px;
                        display:block;
                        border:dashed 3px #666;
                        width:calc(100% - 10px);
                        height:calc(100% - 10px);">
                    </span>`;
            
            addRemoveClass(
                m, "marker", true
            );

            return m;
        }

    }

    // Export
    window[ name ] = _;

} )( "DSO" )