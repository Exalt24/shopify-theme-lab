#!/usr/bin/env python
"""Seed the dev store with the data the sale-event sections read.

Dev store only (dac-dev-store, synthetic data). It creates, and only if missing:
  - product metafield definition  custom.bundle_items  (list of products)
  - collection metafield definition custom.sale_ends_at (date and time)
  - a bundle product "Rider Starter Bundle" (its own price, components listed in bundle_items; no SKU is set)
  - a smart collection "Winter Sale" (tag winter-sale) using the sale-event collection template
  - a page "Winter sale" using the sale-landing page template
  - an automatic 10% discount on that collection that ENDS AT THE SAME INSTANT as the countdown
The product, collection and page are published to the Online Store channel, because productCreate does not publish and the
storefront then serves a 404 that looks exactly like a broken theme.

usage: SHOPIFY_ADMIN_TOKEN=... python scripts/seed_sale_demo.py [--shop dac-dev-store.myshopify.com] [--check]
--check only reads and reports what exists.
"""
import argparse
import datetime
import json
import os
import sys
import urllib.request

API = "2025-10"
COMPONENT_HANDLES = ["the-complete-snowboard", "selling-plans-ski-wax"]
# The bundle's two components are deliberately NOT in the sale. The bundle section compares the bundle price
# with the parts' list prices; if the parts were also discounted, "bought separately" would be a price nobody pays.
SALE_TAGGED = [
    "the-compare-at-price-snowboard",
    "the-collection-snowboard-hydrogen",
    "the-multi-managed-snowboard",
    "the-collection-snowboard-liquid",
]
# 2026-11-27 23:59 US Eastern standard time, as one absolute instant in UTC.
SALE_ENDS_UTC = "2026-11-28T04:59:00Z"


def gql(shop, token, query, variables=None):
    req = urllib.request.Request(
        f"https://{shop}/admin/api/{API}/graphql.json",
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.load(r)
    if body.get("errors"):
        raise SystemExit(f"GraphQL errors: {body['errors'][:2]}")
    return body["data"]


def rest_publish(shop, token, resource, gid):
    """Publish to the Online Store through REST `published: true`.

    GraphQL publishablePublish needs read_publications, a sales-channel scope this app cannot be granted
    (Shopify restricts it to sales-channel apps). REST publishes with write_products
    or write_content alone.
    """
    numeric = gid.rsplit("/", 1)[-1]
    path = {"product": "products", "collection": "smart_collections", "page": "pages"}[resource]
    key = {"product": "product", "collection": "smart_collection", "page": "page"}[resource]
    req = urllib.request.Request(
        f"https://{shop}/admin/api/{API}/{path}/{numeric}.json",
        data=json.dumps({key: {"id": int(numeric), "published": True}}).encode(),
        headers={"X-Shopify-Access-Token": token, "Content-Type": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.load(r)
    return body[key].get("published_at")


def must(payload, key):
    errs = payload[key]["userErrors"]
    if errs:
        raise SystemExit(f"{key} refused: {errs}")
    return payload[key]


def product_by_handle(shop, token, handle):
    q = "query($h:String!){ productByHandle(handle:$h){ id handle title } }"
    return gql(shop, token, q, {"h": handle})["productByHandle"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shop", default="dac-dev-store.myshopify.com")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    token = os.environ.get("SHOPIFY_ADMIN_TOKEN")
    if not token:
        sys.exit("set SHOPIFY_ADMIN_TOKEN (dev store admin token)")
    shop = a.shop
    if shop != "dac-dev-store.myshopify.com":
        sys.exit("refusing: this script seeds the dev store only")

    components = []
    for h in COMPONENT_HANDLES:
        p = product_by_handle(shop, token, h)
        if not p:
            sys.exit(f"component product missing: {h}")
        components.append(p["id"])
    existing_bundle = product_by_handle(shop, token, "rider-starter-bundle")
    existing_coll = gql(shop, token, 'query($h:String!){ collectionByHandle(handle:$h){ id } }', {"h": "winter-sale"})["collectionByHandle"]
    existing_page = gql(shop, token, '{ pages(first:20, query:"handle:winter-sale-landing"){ nodes{ id handle } } }')["pages"]["nodes"]
    print("bundle:", existing_bundle, "| collection:", existing_coll, "| page:", existing_page)
    if a.check:
        return

    defs = [
        ("PRODUCT", "bundle_items", "list.product_reference", "Bundle items"),
        ("COLLECTION", "sale_ends_at", "date_time", "Sale ends at"),
    ]
    for owner, key, typ, name in defs:
        out = gql(shop, token, """
          mutation($d:MetafieldDefinitionInput!){ metafieldDefinitionCreate(definition:$d){
            createdDefinition{ id } userErrors{ code message } } }""",
            {"d": {"name": name, "namespace": "custom", "key": key, "type": typ, "ownerType": owner, "pin": True}})
        errs = [e for e in out["metafieldDefinitionCreate"]["userErrors"] if e["code"] != "TAKEN"]
        if errs:
            sys.exit(f"definition {key} refused: {errs}")
        print("definition", key, "ok")

    for h in SALE_TAGGED:
        p = product_by_handle(shop, token, h)
        must(gql(shop, token, "mutation($id:ID!,$t:[String!]!){ tagsAdd(id:$id,tags:$t){ userErrors{ message } } }",
                 {"id": p["id"], "t": ["winter-sale"]}), "tagsAdd")
    print("tagged", len(SALE_TAGGED), "products winter-sale")
    for h in COMPONENT_HANDLES:
        p = product_by_handle(shop, token, h)
        must(gql(shop, token, "mutation($id:ID!,$t:[String!]!){ tagsRemove(id:$id,tags:$t){ userErrors{ message } } }",
                 {"id": p["id"], "t": ["winter-sale"]}), "tagsRemove")
    print("bundle components kept out of the sale")

    if not existing_bundle:
        made = must(gql(shop, token, """
          mutation($p:ProductCreateInput!){ productCreate(product:$p){
            product{ id variants(first:1){ nodes{ id } } } userErrors{ field message } } }""",
            {"p": {
                "title": "Rider Starter Bundle", "handle": "rider-starter-bundle", "productType": "Bundle",
                "vendor": "Winter Lab", "status": "ACTIVE", "tags": ["bundle"],
                "descriptionHtml": "<p>The Complete Snowboard and Selling Plans Ski Wax in one box, at one price.</p>",
                "metafields": [{"namespace": "custom", "key": "bundle_items", "type": "list.product_reference",
                                "value": json.dumps(components)}],
            }}), "productCreate")
        pid = made["product"]["id"]
        vid = made["product"]["variants"]["nodes"][0]["id"]
        must(gql(shop, token, """
          mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$p,variants:$v){
            userErrors{ message } } }""",
            {"p": pid, "v": [{"id": vid, "price": "679.95", "inventoryItem": {"tracked": False}}]}), "productVariantsBulkUpdate")
        print("bundle created", pid, "published_at", rest_publish(shop, token, "product", pid))

    if not existing_coll:
        made = must(gql(shop, token, """
          mutation($c:CollectionInput!){ collectionCreate(input:$c){ collection{ id } userErrors{ field message } } }""",
            {"c": {
                "title": "Winter Sale", "handle": "winter-sale", "templateSuffix": "sale-event",
                "descriptionHtml": "<p>Every board and accessory in the winter sale.</p>",
                "ruleSet": {"appliedDisjunctively": False, "rules": [{"column": "TAG", "relation": "EQUALS", "condition": "winter-sale"}]},
                "metafields": [{"namespace": "custom", "key": "sale_ends_at", "type": "date_time", "value": SALE_ENDS_UTC}],
            }}), "collectionCreate")
        cid = made["collection"]["id"]
        print("collection created", cid, "published_at", rest_publish(shop, token, "collection", cid))
    else:
        cid = existing_coll["id"]

    # A countdown only counts down. The offer itself must end at the same instant, or the page says "ended"
    # while the sale price keeps selling (or the reverse). An automatic discount with an endsAt does that.
    found = gql(shop, token, """query($q:String!){ discountNodes(first:5, query:$q){ nodes{ id } } }""",
                {"q": "title:'Winter sale 10% off'"})["discountNodes"]["nodes"]
    if not found:
        made = must(gql(shop, token, """
          mutation($d:DiscountAutomaticBasicInput!){ discountAutomaticBasicCreate(automaticBasicDiscount:$d){
            automaticDiscountNode{ id } userErrors{ field message } } }""",
            {"d": {
                "title": "Winter sale 10% off",
                "startsAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "endsAt": SALE_ENDS_UTC,
                "combinesWith": {"orderDiscounts": False, "productDiscounts": False, "shippingDiscounts": False},
                "customerGets": {"value": {"percentage": 0.1}, "items": {"collections": {"add": [cid]}}},
            }}), "discountAutomaticBasicCreate")
        print("discount created", made["automaticDiscountNode"]["id"], "ends", SALE_ENDS_UTC)

    if not existing_page:
        made = must(gql(shop, token, """
          mutation($p:PageCreateInput!){ pageCreate(page:$p){ page{ id handle } userErrors{ message } } }""",
            {"p": {"title": "Winter sale", "handle": "winter-sale-landing", "templateSuffix": "sale-landing",
                   "body": "", "isPublished": True}}), "pageCreate")
        print("page created", made["page"])


if __name__ == "__main__":
    main()
