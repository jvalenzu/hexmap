// function to regenerate map
function resizeCanvas(num_cols, num_rows)
{
    let container = document.getElementById("map-container");
    const width = container.offsetWidth;
    const height = container.offsetHeight;
    
    let svg = document.getElementById("svg");
    svg.setAttribute("style", "width:"+ width + ";height:"+ height +";");
    
    let map = document.getElementById("map");
    while (map.childElementCount)
        map.removeChild(map.children[0]);
    
    var start_xoffset = 0;
    var start_yoffset = 0;
    
    var xoffset = start_xoffset;
    var yoffset = start_yoffset;
    
    
    const vy = 87;
    
    for (let r=-num_rows,nr=num_rows; r<nr; ++r)
    {
        let xbias = (r&1) * 153;
        
        for (let c=-(num_cols/2-1), nc=(num_cols/2-2); c<=nc; ++c)
        {
            let points =
                    [
                        " 100,   0",
                        ` +50, -${vy}`,
                        ` -50, -${vy}`,
                        "-100,  -0",
                        ` -50,  ${vy}`,
                        ` +50,  ${vy}`
                    ];
            
            let g = document.createElementNS(svgns, "g");
            g.setAttribute("transform","translate("+(xoffset+xbias)+","+yoffset+")");
            
            let polygon = document.createElementNS(svgns, "polygon");
            polygon.setAttribute("points", points.join(' '));
            polygon.setAttribute("overflow","visible");
            polygon.setAttribute("class", "hex-unselected");
            
            g.appendChild(polygon);
            
            {
                let isDragging = false;
                let startX, startY, currentX, currentY;
                
                svg.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    startX = e.clientX - svg.getBoundingClientRect().left;
                    startY = e.clientY - svg.getBoundingClientRect().top;
                });
                
                svg.addEventListener('mousemove', (e) => {
                    if (isDragging) {
                        e.preventDefault();
                        currentX = e.clientX - svg.getBoundingClientRect().left;
                        currentY = e.clientY - svg.getBoundingClientRect().top;
                        
                        const deltaX = currentX - startX;
                        const deltaY = currentY - startY;
                        
                        g_UIState.viewport = { x: -deltaX, y: -deltaY, width: 1000, height: 1000 };
                        
                        refreshUi();
                    }
                });
                
                window.addEventListener('mouseup', () => {
                    isDragging = false;
                });
            }
            
            let qp = 2*c + (r&1);
            let rp = (r - (r&1))/2 - c;
            
            polygon.setAttribute("id",((rp<<16) | (qp&0xffff)));
            g.setAttribute("id",      ((rp<<16) | (qp&0xffff)));
            
            if (g_Debug)
            {
                let label = document.createElementNS(svgns, "text");
                label.setAttributeNS(null, "x","-25");
                label.setAttributeNS(null, "y","-40");
                label.setAttributeNS(null, "font-size","40");
                label.setAttributeNS(null, "fill","blue");
                
                let label_east = document.createElementNS(svgns, "text");
                label_east.setAttributeNS(null, "x","20");
                label_east.setAttributeNS(null, "y","15");
                label_east.setAttributeNS(null, "font-size","40");
                label_east.setAttributeNS(null, "fill","white");
                
                let label_south = document.createElementNS(svgns, "text");
                label_south.setAttributeNS(null, "x","-25");
                label_south.setAttributeNS(null, "y","75");
                label_south.setAttributeNS(null, "font-size","40");
                label_south.setAttributeNS(null, "fill","lightgreen");
                
                label.appendChild(document.createTextNode(`q: ${qp}`));
                label_east.appendChild(document.createTextNode(`r: ${rp}`));
                label_south.appendChild(document.createTextNode(`s: ${-qp-rp}`));
                
                g.appendChild(label);
                g.appendChild(label_east);
                g.appendChild(label_south);
            }
            
            map.appendChild(g);
            xoffset += 306;
        }
        
        yoffset += 88;
        xoffset = start_xoffset;
    }
}

