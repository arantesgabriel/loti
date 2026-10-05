# Context

## Why Loti exists

The initial group consists of five people who buy/import products from China together. Today the workflow lives in a shared spreadsheet and has grown beyond what spreadsheet tabs model cleanly.

Each person maintains personal favorites containing product links, names, prices and optional variation/model information. Before a purchase, the group manually creates another area/tab that acts like a temporary cart for the next HubBuy account. HubBuy accounts are intentionally changed between purchase rounds to use discounts, so HubBuy itself cannot serve as the persistent shared cart.

The main pain is not calculation; it is **organization, ownership, duplication and moving information from favorites into a shared purchase**.

## What the workbook revealed

The analyzed workbook contained multiple concepts represented as peer sheets/sections:

- personal favorites for Gabriel;
- personal favorites for Brunna;
- a shared next purchase;
- a later/current purchase;
- a Shein/Shopee research list;
- HubBuy suppliers;
- a Build PC project;
- a Presentes section embedded in another sheet.

At analysis time there were roughly 150 useful rows across these structures. The exact numbers are not product rules; they only demonstrate that the spreadsheet has already outgrown a single flat list.

## Root structural problem

The spreadsheet uses **physical location** to encode domain meaning:

- a sheet name tells us who owns an item;
- another sheet name tells us whether something is a purchase;
- a side section inside a sheet means “Presentes”;
- a new month creates a new sheet.

Loti converts those implicit meanings into explicit data:

- `owner` identifies the person;
- `collection` organizes a favorite;
- `purchase` represents one group buying round;
- `purchase_item` represents a concrete item in a purchase.

## Important observed edge cases

The existing workflow proves that the following are real, not hypothetical:

- favorites can have no price yet;
- one product/favorite can enter a purchase multiple times with different people and variations;
- one person can buy multiple units of the same variation;
- a favorite price is only a reference and may differ from the actual purchase price;
- historical purchase data must not change when a favorite is edited later;
- the same marketplace product may be saved with different tracking/referral query parameters;
- multiple marketplaces are used, including HubBuy, Weidian, Taobao, 1688, Goofish, Shopee and Shein;
- a purchase needs to remember which HubBuy account/email was used;
- on the actual buying day, the group needs to know which items have already been transferred into the real HubBuy cart.

## Product thesis

Loti should be the smallest web app that makes the spreadsheet unnecessary:

> A shared space where each person keeps personal favorites and can move them into one collective purchase without copying, reorganizing or recreating information.

The product must remain a lightweight consumer tool, not become an import-management ERP.
