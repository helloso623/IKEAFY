# Furniture-piece sourcing policy

IKEAlive's **Hunt table pieces** action finds pieces that can make the table currently modeled. It records:

- construction routes for the current shape, such as a cut-to-size top with ready-made legs or an all-wood apron frame;
- a dimensioned cut list for the modeled top, legs, shelves, and other visible pieces;
- method-specific cuts, such as recessed apron rails;
- nearby catalog pieces by dimensions and ordinary legal search links for cut-to-size stock;
- an IKEA whole-product article only when the modeled envelope closely matches.

The optional live provider is the existing Tavily Search API. One `basic` request researches the whole saved model revision, keeping the action inexpensive. Tavily documents 1,000 free credits per month and one credit per basic search: <https://docs.tavily.com/documentation/api-credits>.

Without a Tavily key, local dimension matches and normal public search URLs remain available. IKEAlive does not scrape retailer catalogs.

Every piece hunt records the model signature, dimensions, candidate routes, cut list, PDF metadata, and IKEAlive run in `project.diyHistory`. Editing the table and hunting again creates a new immutable revision; prior piece plans remain printable.

The PDF is produced through the browser's print-to-PDF path, so model geometry is not uploaded to a PDF service. Dimensions follow the model, but the builder must still verify stock, joinery, loads, and safe tool use before cutting.
