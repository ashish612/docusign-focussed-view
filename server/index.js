const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
dotenv.config();
const docusign = require("docusign-esign");
const fs = require("fs");
const session = require("express-session");
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

app.use(session({
   secret: "320512ca46273a4600e8c8dc4b6c8ebd5fa7e56c58ed",
   resave: true,
   saveUninitialized: true,
}));

const CLIENT_USER_ID = uuidv4();

app.post("/envelope", async (request, response) => {
   await checkToken(request);
   
   payload = request.body;
   console.log(payload)

   let envelopesApi = getEnvelopesApi(request);   
   let envelope = makeEnvelope(payload);   
   let results = await envelopesApi.createEnvelope(process.env.ACCOUNT_ID, {envelopeDefinition: envelope});
   console.log("envelope results ", results);

   // payload = {
   //    "company_name": request.body.company_name,
   //    "service_info":{
   //       "address" :request.body.svc_address,
   //       "city" : request.body.svc_city,
   //       "state" : request.body.svc_state,
   //       "zipcode": request.body.svc_zipcode
   //    },
   //    "carrier_info":{
   //       "name": request.body.carrier_name,
   //       "btn": request.body.carrier_btn
   //    },
   //    "numbers":request.body.numbers,
   //    "auth_contact_name":request.body.auth_contact_name,
   //    "email" : request.body.email
   // }
   
   // Create the recipient view, the Signing Ceremony   

   // add envelopeId to session.
   request.session.envelope_id = results.envelopeId

   let viewRequest = makeRecipientViewRequest(payload);
   results = await envelopesApi.createRecipientView(process.env.ACCOUNT_ID, results.envelopeId,
       {recipientViewRequest: viewRequest});

   console.log("envelope results ", results);
      
   response.status(201).json(
      {
         url:results.url, 
         client_id:process.env.INTEGRATION_KEY
      });
});

function getEnvelopesApi(request) {
   let dsApiClient = new docusign.ApiClient();
   dsApiClient.setBasePath(process.env.BASE_PATH);
   dsApiClient.addDefaultHeader('Authorization', 'Bearer ' + request.session.access_token);
   return new docusign.EnvelopesApi(dsApiClient);
}

function makeEnvelope(data){
   let env = new docusign.EnvelopeDefinition();
   env.templateId = process.env.TEMPLATE_ID;

   let signer1 = docusign.TemplateRole.constructFromObject({
      email: data.email,      
      name: data.auth_contact_name,
      tabs: {
         "textTabs": [
            {
               "anchorCaseSensitive" :false,
               "anchorString":"/c_name/",
               "anchorUnits": "pixels",
               "anchorYOffset": -7,
               "name": "customer_name", 
               "optional": true,
               "locked" :true,
               "value": data.company_name,
               "fontSize":"Size12",                              
               "font":"LucidaConsole"
            },
           {
             "tabLabel": "company_name",
             "value": data.company_name,
             "locked" :true,
           },
           {
             "tabLabel": "svc_address",
             "value": data.service_info.address,
             "locked" :true,
           },
           {
            "tabLabel": "svc_city",
            "value": data.service_info.city,
            "locked" :true,
          },
          {
            "tabLabel": "svc_state",
            "value": data.service_info.state,
            "locked" :true,
          },
          {
            "tabLabel": "svc_zipcode",
            "value": data.service_info.zipcode,
            "locked" :true,
          },
          {
            "tabLabel": "carrier_name",
            "value": data.carrier_info.name,
            "locked" :true,
          },
          {
            "tabLabel": "carrier_btn",
            "value": data.carrier_info.btn,
            "locked" :true,
          },
          {
            "tabLabel": "numbers",
            "value": data.numbers,
            "locked" :true,
          },
          {
            "tabLabel": "auth_contact_name",
            "value": data.auth_contact_name,
            "locked" :true,
          },
         ]
      },
      clientUserId: CLIENT_USER_ID,
      roleName: 'Signer'});

   env.templateRoles = [signer1];
   env.status = "sent";

   return env;
}

function makeRecipientViewRequest(data) {   

   let viewRequest = new docusign.RecipientViewRequest();

   viewRequest.returnUrl = "http://localhost:6000/success";
   viewRequest.authenticationMethod = 'none';

   // Recipient information must match embedded recipient info
   // we used to create the envelope.
   viewRequest.email = data.email;
   viewRequest.userName = data.auth_contact_name;
   viewRequest.clientUserId = CLIENT_USER_ID;
   viewRequest.frameAncestors = ["https://apps-d.docusign.com", "http://localhost:7000"];
   viewRequest.messageOrigins = ["https://apps-d.docusign.com"];

   return viewRequest
}


async function checkToken(request) {
   if (request.session.access_token && Date.now() < request.session.expires_at) {
      console.log("re-using access_token ", request.session.access_token);
   } else {
      console.log("generating a new access token");
      let dsApiClient = new docusign.ApiClient();
      dsApiClient.setBasePath(process.env.BASE_PATH);
      const results = await dsApiClient.requestJWTUserToken(
          process.env.INTEGRATION_KEY,
          process.env.USER_ID,
          "signature impersonation",
          fs.readFileSync(path.join(__dirname, "private.key")),
          3600
      );
      console.log(results.body);
      request.session.access_token = results.body.access_token;
      request.session.expires_at = Date.now() + (results.body.expires_in - 60) * 1000;
   }
}

app.get("/", async (request, response) => {
   response.status(200).json({text:'all good!'});
});

// app.get("/success", async (request, response) => {
//    const query = request.query;
   
//    if(query.event=='signing_complete'){
//       console.log(process.env.ACCOUNT_ID,request.session.envelope_id);
//       let envelopeApi = getEnvelopesApi(request);
//       let result = await envelopeApi.getDocument(
//          process.env.ACCOUNT_ID,
//          request.session.envelope_id,
//          "1");
//       console.log(result);
//       // let data=`data:application/pdf;base64,${result}`;
//       // response.send(`<a href="" data='${result}' id='download' type="application/pdf"></a>`);

//       response.writeHead(200, {
//          'Content-Type': 'application/pdf',
//          'Content-Disposition': 'inline; filename="signed_contract.pdf"',
//          'Content-Length': result.length
//        });
 
//       //  const download = Buffer.from(result.toString('utf-8'), 'base64');
 
//        response.end(result);

//    }
//    else 
//       response.send('Rejected Signing')
// });

app.listen(5000, () => {
   console.log("server has started");
});