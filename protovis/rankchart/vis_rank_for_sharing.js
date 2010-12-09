function vrank_render() {
    /* Dimensions, allowing for dynamic resizing of the charts based on the dimensions
    of the containing div */
    vrank_w = typeof vrank_w  != 'undefined' ? vrank_w : 440;
    vrank_h = typeof vrank_h  != 'undefined' ? vrank_h : 230;
    var vrank_cw = 50, // width of context chart
        vrank_pad = 8; // padding between charts
    var vrank_endday = new Date(tdata.date_period_end);
    var vrank_max_delta = 50;       // color threshold; at what point do we get 0 transparency? 
        
    /* User-defined variables */
    var vrank_byDimension = $("#vis_vrank_dimension").val();
    var vrank_period = 7;
    
 
    /* Prepare data */
    /* Data Structure: 
    array [
        0:{
            label: ..., // is a string
            day: ..., // is a date, I think
            count: ..., // is a number
        }, ...
    ]
    */

    // Compute totals by day
    var vrank_sumByDay = pv.nest(vrank_array)
        .key(function(d) { return d.day})
        .rollup(function(v) { return pv.sum(v, function(d) { return d.count})});
    // Filter only the two dates being compared
    vrank_array = vrank_array.filter(function(d) {return d.day.getDOY() == myEndDate.getDOY()-1|| d.day.getDOY() == (myEndDate.getDOY() - vrank_period-1)});
    
    // Sort alphabetically to optimize our search 
    // TODO: verify it actually helps!
    vrank_array = vrank_array.sort(function(a,b){
        if (a.label < b.label) return -1; 
        if (a.label > b.label) return 1;
        return 0
    });
    
    // Add a new array function to search by label
    Array.prototype.labelIndexOf = function (obj, fromIndex) {
        if (fromIndex == null) {
            fromIndex = 0;
        } else if (fromIndex < 0) {
            fromIndex = Math.max(0, this.length + fromIndex);
        }
        for (var i = fromIndex, j = this.length; i < j; i++) {
            if (this[i].label === obj)
                return i;
        }
        return -1;
    };
    
    // Prepare information
    vrank_list = []; 
    $.each(vrank_array, function(idx, element) {
            var day = (element.day.getDOY() == myEndDate.getDOY()-1) ? 1:0;
            var index = vrank_list.labelIndexOf(element.label);
            if (index > 0) {
                // If the element already exists, add values
                vrank_list[index].count[0] += (day == 0) ? element.count : 0;
                vrank_list[index].count[1] += (day == 1) ? element.count : 0
            } else {
                // If the element doesn't exist, add it
                var tmp = {};
                tmp.label = element.label;
                tmp.count = [[],[]];
                tmp.count[0] = (day == 0) ? element.count : null;
                tmp.count[1] = (day == 1) ? element.count : null;
                tmp.rank = [[],[]];
                vrank_list.push(tmp);
            }
    })
    delete vrank_array;
    
    // FIXME: We filter out new and outdated pages, but eventually we want to 
    // show them separately
    vrank_list = vrank_list.filter(function(d){ return d.count[0] != null && d.count[1] != null });

    
    // Sort by count, then add rank
    for(j = 0; j<2; j++) {
        vrank_list = vrank_list.sort(function(a,b){ return b.count[j] - a.count[j] });
        $.each(vrank_list, function(idx, element) {
                // TODO: preserve null values to later isolate new/obsolete pages
                element.rank[j] = (element.count[j] == null) ? 0 : idx;
                // Save a rank gain/loss
                if (j>0) element.rankDelta = element.rank[0] - idx;
        })
    }
    
    // Remove unwanted pages
    vrank_list = vrank_list.filter(function(d) { 
            switch( $('#vis_vrank_criterium').val()) {
            case 'gain':
                return d.rankDelta > 0;
                break;
            case 'loss':
                return d.rankDelta < 0;
                break;
            default:
                return 1;
            }
    });
    
    // Re-sort to draw from first day
    vrank_list = vrank_list.sort(function(a,b){ return a.rank[0] - b.rank[0] });
    
    // Prepare some variables
    var vrank_max_linewidth = pv.max(vrank_list, function(d) {return pv.sum(d.count)}),
        vrank_min_linewidth = pv.min(vrank_list, function(d) {return pv.sum(d.count)}),
        vrank_max_rank = pv.max(vrank_list, function(d) { return Math.max(d.rank[0], d.rank[1])  });
    
    /* Root panel and charts */
    var vrank = new pv.Panel()
        .width(vrank_w)
        .height(vrank_h)
        .left(5)
        .right(5)
        .top(5)
        .bottom(3);
    
    /* Tooltips and other interaction */
    var vrank_tipsyFn = pv.Behavior.tipsy({gravity: "s", fade: true, html: true, delayOut: 1000, opacity: 0.9});
    var vrank_mouseover = function(data){
        vrank_focus_panel.i(this.parent.index);
        vrank_tipsyFn.apply(this, arguments);
        this.parent.render();
        return this;
    }
    /* Focus */    
    //Interaction state. Focus scales will have domain set on-render. 
    var vrank_i = {y:0, dy:vrank_h*.5}
    
    var vrank_fw = vrank_w - vrank_cw - vrank_pad,
        vrank_fx = pv.Scale.linear(0,1).range(4, vrank_fw-4),
        vrank_fy = pv.Scale.linear(0,vrank_max_rank),
        vrank_fz = pv.Scale.linear(vrank_min_linewidth,vrank_max_linewidth).range(1, 7)
    
    var vrank_focus = vrank.add(pv.Panel)
        .def("init", function(d) {
                vrank_fy.range(
                    -(vrank_i.y * vrank_h / vrank_i.dy)+4,  // proportional to the displacement of the focus area
                    -(vrank_i.y * vrank_h / vrank_i.dy)-4 + (vrank_h *vrank_h / vrank_i.dy) );     // (vrank_h*vrank_h/vrank_i.dy) = height proportional to the selection's height
        })
        .width(vrank_fw)
        .height(vrank_h)
        .left(0)
        .strokeStyle("#ccc")
        .fillStyle("#fff");
        
    var vrank_focus_panel = vrank_focus.add(pv.Panel)
        .def("i", -1)
        .overflow("hidden")
        .data(function() {vrank_focus.init(); return vrank_list})
        .title(function() {  return "<span style='font-size:12px'>"+this.data().label + "</span><hr/><em>Rank:</em> "+ this.data().rank[0] + " -> " + this.data().rank[1] })
    
    var vrank_focus_panel_line = vrank_focus_panel.add(pv.Line)
        .data(function(d) { return d.rank})
        .strokeStyle(function(d){return vrank_focus_panel.i() == this.parent.index ? "black" : pv.color('steelblue').alpha(Math.abs(this.parent.data().rankDelta/vrank_max_delta)) } )
        .left(function() {return (this.index*vrank_fw) + ( this.index==0 ? 15 : -15 )})
        .top(function(d) {return vrank_fy(d)})
        .lineWidth(function() { return vrank_fz(pv.sum(this.parent.data().count)) })
        .title(function() {  return this.parent.title()})
        .event("mouseover", vrank_mouseover)
        .event("mouseout", function(d) { return (vrank_focus_panel.i(-1), this)})
        .add(pv.Dot)
            .shape("square")
            .shapeRadius(function() { return (vrank_h / (vrank_max_rank * vrank_i.dy / vrank_h ))/2})
            .fillStyle('steelblue') 
            .strokeStyle(function() {return vrank_focus_panel.i() == this.parent.index ? "black" : this.parent.strokeStyle().alpha(0)})
            .lineWidth(1)
            .title(function() {  return this.parent.title()})
            .event("mouseover", vrank_mouseover)
            .event("mouseout", function(d) { return (vrank_focus_panel.i(-1), this)});
        

        
        
    /* Context */
    var vrank_cx = pv.Scale.linear(0,1).range(2, vrank_cw-2);
    var vrank_cy = pv.Scale.linear(0,vrank_max_rank).range(2,vrank_h-2);
    var vrank_cz = pv.Scale.linear(Math.max(0-vrank_list.length, -vrank_max_delta), 0, Math.min(vrank_list.length, vrank_max_delta))
                            .range(conf.color.three_point_low, pv.color("rgba(200,200,200,.05)"), conf.color.three_point_high);

    var vrank_con= vrank.add(pv.Panel)
        .width(vrank_cw)
        .height(vrank_h)
        .right(0)
        .strokeStyle("#ccc")
        .fillStyle("#fff");

    var vrank_con_panel = vrank_con.add(pv.Panel)
        .def("i", -1)
        .data(vrank_list);
        
    var vrank_con_panel_line = vrank_con_panel.add(pv.Line)
        .data(function(d) {return d.rank})
        .strokeStyle(function(d){return vrank_con_panel.i() == this.parent.index ? "black" : pv.colors('steelblue').alpha(Math.abs(this.parent.data().rankDelta/vrank_max_delta))})
        .left(function() {return vrank_cx(this.index)})
        .top(function(d) {return vrank_cy(d)})
        .lineWidth(1)
        .title(function() {  return this.parent.data().label + " : "+ this.parent.data().rank[0] + " -> " + this.parent.data().rank[1] });
        
    /* The selectable, draggable focus region in the context chart. */
    vrank_con.add(pv.Panel)
        .data([vrank_i])
        .cursor("crosshair")
        .events("all")
        .event("mousedown", pv.Behavior.select())
        .event("select", vrank)
      .add(pv.Bar)
        .top(function(d) {return  d.y})
        .height(function(d) { return d.dy} )
        .fillStyle(function(d) { return d.fix ? pv.color("orange").alpha(.4) : "rgba(128, 128, 128, .4)" })
        .cursor("move")
        .event("mousedown", pv.Behavior.drag())
        .event("drag", function() {return vrank});
    
        
    /* Render */
    vrank.canvas("vis_rank_container").render();
}        
