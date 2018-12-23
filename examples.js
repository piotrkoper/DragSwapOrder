const ORDER = {
    isDraggedClass: "is-dragged",
    hasDraggedClass: "has-dragged",
    targetContainerClass: "is-target",
    elemSelector: "li",
    handlerElemSelector: "li>span",
    onDropFunc: ( draggedElem, fromContainer, targetElem ) => console.log( draggedElem, fromContainer, targetElem ),
    onBeforeDragFunc: ( draggedElem ) => console.log( draggedElem ),
    //customMarkerFunc: ( draggedElem ) => { return draggedElem },
};

const SWAP = {
    isDraggedClass: "is-dragged",
    hasDraggedClass: "has-dragged",
    targetContainerClass: "is-target",
    elemSelector: "li",
    handlerElemSelector: "li>span",
    isSwap: true,
    swapTargetClass: "swap-target",
    onDropFunc: ( draggedElem, fromContainer, targetElem ) => console.log( draggedElem, fromContainer, targetElem ),
    onBeforeDragFunc: ( draggedElem ) => console.log( draggedElem ),
    markerSetDimentions: false
};

const sl1 = new DSO( document.querySelector( "#sl-1" ), ORDER );
const sl2 = new DSO( document.querySelector( "#sl-2" ), ORDER );
const sl3 = new DSO( document.querySelector( "#sl-3" ), ORDER );
const sl4 = new DSO( document.querySelector( "#sl-4" ), ORDER );

const sl5 = new DSO( document.querySelector( "#sl-5" ), SWAP );
const sl6 = new DSO( document.querySelector( "#sl-6" ), SWAP );
const sl7 = new DSO( document.querySelector( "#sl-7" ), SWAP );
const sl8 = new DSO( document.querySelector( "#sl-8" ), SWAP );

SWAP.isSwap = false;
const sl9 = new DSO( document.querySelector( "#sl-9" ), SWAP );
SWAP.markerSetDimentions = true;
const sl10 = new DSO( document.querySelector( "#sl-10" ), SWAP );

sl5.setlinked( [ sl6, sl7, sl8 ] );
sl6.setlinked( [ sl5, sl7, sl8 ] );
sl7.setlinked( [ sl5, sl6, sl8 ] );
sl8.setlinked( [ sl5, sl6, sl7 ] );

var sls = [ sl1, sl2, sl3, sl4 ];
sls.forEach( ( sl, i ) => {
    sl.setlinked( sls.slice( sls.length - 1 - i ) )
} );