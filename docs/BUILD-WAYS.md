# Furniture-piece sourcing policy

IKEAlive's **Hunt table pieces** action finds pieces that can make the table currently modeled. It records:

- tabletops, legs, aprons, stretchers, boards, and other furniture bodies in the model's shapes and millimetres;
- candidate routes such as a cut-to-size top with ready-made legs or a top, legs, and apron frame;
- generic cut-to-size sheet goods and lumber where no exact product exists;
- nearby catalog pieces by dimensions and ordinary legal search links;
- an IKEA whole-product article only when the modeled envelope closely matches.

The optional live provider is the existing Tavily Search API. One `basic` request looks for dimension-bearing furniture pieces for the current model revision. Tavily documents one credit per basic search: <https://docs.tavily.com/documentation/api-credits>.

Without a Tavily key, local dimension matches and normal public retailer and lumber search URLs remain available. IKEAlive does not scrape retailer catalogs. Loose connection hardware is outside this feature.

Every piece hunt records the model signature, dimensions, candidate routes, piece list, PDF metadata, and IKEAlive run in `project.diyHistory`. Editing the table and hunting again creates a new immutable revision; prior piece plans remain printable.

The PDF is produced through the browser's print-to-PDF path, so model geometry is not uploaded to a PDF service. Dimensions follow the model, but the builder must still verify stock, joinery, loads, and safe tool use before cutting.
