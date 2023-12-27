
function foo()
{
    let res = new Object();
    
    for (let r=-2; r<=2; ++r)
    {
        for (let c=-2; c<=2; ++c)
        {
            let qp = 2*c + (r&1);
            let rp = (r - (r&1))/2 - c;
            
            let hexId = (rp<<16) | qp;

            let c0 = (hexId&0xffff)<<16>>16;
            let r0 = hexId>>16;
            let s0 = -c0 - r0;

            let p = function(x,p) {
                return x.toString().padStart(p, ' ');
            };
            let p2 = function(x) {
                return p(x,2);
            };

            if (hexId in res)
                res[hexId].push(`Offset: (${p2(qp)},${p2(rp)}) Coord: (${p2(c0)},${p2(r0)},${p2(s0)}) HexId: ${p(hexId,8)}`);
            else
                res[hexId] = [ `Offset: (${p2(qp)},${p2(rp)}) Coord: (${p2(c0)},${p2(r0)},${p2(s0)}) HexId: ${p(hexId,8)}` ];

            console.log(`Offset: (${p2(qp)},${p2(rp)}) Coord: (${p2(c0)},${p2(r0)},${p2(s0)}) HexId: ${p(hexId,8)}`);
        }
    }

    for (let key in res)
    {
        console.log(`KEY: ${key}`);
        for (let value in res[key])
        {
            console.log(`    VALUE: ${value}`);
        }
    }
}
foo();
