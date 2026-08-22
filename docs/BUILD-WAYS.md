# Ways-to-make research policy

IKEAlive's **Finish / Find a way** action analyzes the furniture currently modeled and ranks practical ways to make that exact result. It records:

- the current geometry, silhouette, support style, visible finish, dimensions, and a local geometry fingerprint;
- construction methods such as a cut-to-size top with ready-made legs, a traditional apron frame, or a shaped pedestal;
- tabletops, legs, aprons, stretchers, boards, and other primary furniture bodies in the model's shapes and millimetres;
- generic cut-to-size sheet goods and lumber where no exact product exists;
- nearby catalog pieces by dimensions and ordinary legal search links;
- an IKEA whole-product article only when the modeled dimensions and silhouette closely match.

The optional live provider is the existing Tavily Search API. One `basic` request looks for construction methods and dimension-bearing primary pieces for the current model revision. Tavily documents one credit per basic search: <https://docs.tavily.com/documentation/api-credits>.

Without a Tavily key, local shape and dimension matches plus normal public retailer and lumber search URLs remain available. IKEAlive does not scrape retailer catalogs. Loose fasteners, connection-hardware shopping lists, and unrelated parts are outside this feature.

Every finish run records the model signature, dimensions, ranked construction ways, cut list, PDF metadata, and IKEAlive run in `project.diyHistory`. Geometry and finish traits participate in the signature, so editing the table and finishing again creates a new immutable revision while prior ways remain printable.

The browser's print-to-PDF path produces the packet, and only compact shape traits—not triangle data—are sent to the local API. Dimensions follow the model, but the builder must still verify stock, joinery, loads, and safe tool use before cutting.
