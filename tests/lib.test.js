import test from 'node:test';
import assert from 'node:assert/strict';
import{parseCard,renderTemplate}from'../src/lib.js';
test('OCR extracts a reviewable contact without inventing missing fields',()=>{assert.deepEqual(parseCard('Jane Doe\njane@example.com\n+1 (415) 555-1234'),{first_name:'Jane',last_name:'Doe',email:'jane@example.com',phone:'+1 (415) 555-1234',notes:'Jane Doe\njane@example.com\n+1 (415) 555-1234'});assert.equal(parseCard('').email,'')});
test('templates substitute only supported literal fields',()=>{assert.equal(renderTemplate('Hi {{ first_name }} {{last_name}} {{unknown}}',{first_name:'$&',last_name:'Doe'}),'Hi $& Doe {{unknown}}')});
