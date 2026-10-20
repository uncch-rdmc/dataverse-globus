import { Component, EventEmitter, Input, OnInit, Output, inject, ChangeDetectionStrategy } from '@angular/core';
import { GlobusService } from '../globus.service';
import {TranslateModule, TranslateService} from '@ngx-translate/core';
import {TransferData} from '../models/transfer-data';
import {Config} from '../app.component';
import * as ConfigJson from '../../assets/config.json';


import {MatToolbarModule} from '@angular/material/toolbar';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {FormControl, ReactiveFormsModule} from '@angular/forms';
import PKCE from 'js-pkce';




@Component({
    selector: 'app-interface',
    standalone: true,
    imports: [
    TranslateModule,
    MatToolbarModule,
    MatFormFieldModule,
    MatSelectModule,
    ReactiveFormsModule
],
    templateUrl: './interface.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./interface.component.css']
})
export class InterfaceComponent implements OnInit {
    private globusService = inject(GlobusService);
    private translatePar = inject(TranslateService);


    translate: TranslateService;
    @Input() redirectURL: string;
    @Output() newItemEvent = new EventEmitter<TransferData>();
    transferData: TransferData;
    languages: FormControl;
    langArray: any[] = [];
    signedUrlData: any;
    PkceAuth: PKCE;
    state: string;

    config: Config = (ConfigJson as any).default;


  constructor() {
      const translatePar = this.translatePar;

      this.translate = translatePar;
      this.translate.addLangs(['en', 'fr']);
      this.translate.setDefaultLang('en');
      this.langArray.push({value: 'en', viewValue: 'English'});
      this.langArray.push({value: 'fr', viewValue: 'Français'});

      const browserLang = this.translate.getBrowserLang();
      if (browserLang) {
          this.translate.use(browserLang.match(/en|fr/) ? browserLang : 'en');
      }
      this.languages = new FormControl(this.translate.currentLang);
  }
  title: string;
  dvLocale: string;

  ngOnInit(): void {

      this.PkceAuth = new PKCE({
          client_id: this.config.globusClientId ,  // Update this using your native client ID
          redirect_uri: this.redirectURL,  // Update this if you are deploying this anywhere else (Globus Auth will redirect back here once you have logged in)
          authorization_endpoint: 'https://auth.globus.org/v2/oauth2/authorize',  // No changes needed
          token_endpoint: 'https://auth.globus.org/v2/oauth2/token',  // No changes needed
          requested_scopes:  'urn:globus:auth:scope:transfer.api.globus.org:all openid email profile'
          //'urn:globus:auth:scope:transfer.api.globus.org:all'  // Update with any scopes you would need, e.g. transfer
      });

      this.globusService.consentRequired.subscribe(scopes => {
          const newScopes = scopes.join(' ') + ' openid email profile';
          sessionStorage.removeItem('pkce_code_verifier');
          this.PkceAuth = new PKCE({
              client_id: this.config.globusClientId,
              redirect_uri: this.redirectURL,
              authorization_endpoint: 'https://auth.globus.org/v2/oauth2/authorize',
              token_endpoint: 'https://auth.globus.org/v2/oauth2/token',
              requested_scopes: newScopes
          });
          const additionalParams = {state: this.state};
          window.location.replace(this.PkceAuth.authorizeUrl(additionalParams));
      });

        this.transferData = {} as TransferData;
        this.transferData.load = false;
        this.title = 'Globus';

        this.transferData.datasetDirectory = '';
        const code = this.globusService.getParameterByName('code',null);
        const callback = this.globusService.getParameterByName('callback',null);
        const dvLocale = this.globusService.getParameterByName('dvLocale',null);

        if (callback) {  // getParameterByName returns '' (not null) when absent
          const code = this.getCode(callback, dvLocale);
        } else {
            this.state = this.globusService.getParameterByName('state',null);
            this.getUserAccessToken(code, this.state);

        }
    }

    setLanguage() {
        if (this.dvLocale != null) {
            if (this.dvLocale === 'en') {
                this.translate.use('en');
            } else if (this.dvLocale === 'fr') {
                this.translate.use('fr');
            } else {
                const browserLang = this.translate.getBrowserLang();
                if (browserLang) {
                    this.translate.use(browserLang.match(/en|fr/) ? browserLang : 'en');
                }
            }
        } else {
            const browserLang = this.translate.getBrowserLang();
            if (browserLang) {
                this.translate.use(browserLang.match(/en|fr/) ? browserLang : 'en');
            }
        }
    }
    onLanguageChange(language: string) {
        this.translate.use(language);
    }

    getUserAccessToken(code, state) {
        const url = window.location.href;
        const additionalParams = {state: state};
        this.PkceAuth.exchangeForAccessToken(url).then((resp) => {
            const token = resp;
            this.transferData.userAccessTokenData = token;
            this.getDataverseInformation();
            // Do stuff with the access token.
        });
    }

    getDataverseInformation() {
        const state = this.globusService.getParameterByName('state', null);
        if (state !== undefined) {
            const signedUrl = this.decodeCallback(state);
            if (signedUrl != null) {
                this.globusService.getDataverse(signedUrl).subscribe({
                    next: (value: any) => {
                        this.signedUrlData = value;
                    },
                    error: (error: any) => {
                        console.log(error);
                    },
                    complete: () => {
                        this.getParameters(this.signedUrlData["data"]['queryParameters']);
                        this.transferData.signedUrls = this.signedUrlData['data']['signedUrls'];
                        this.transferData.load = true;
                        this.newItemEvent.emit(this.transferData);
                    }
                });
            }
        }
    }


    getCode(callback, dvLocale) {
        sessionStorage.removeItem('pkce_code_verifier');
        const decodedCallback = this.decodeCallback(callback);
        let state = decodedCallback + '&dvLocale=' + dvLocale;
        state = btoa(state);
        this.state = state;
        const clientId = this.config.globusClientId;

        const additionalParams = {state: state};
        const myWindows = window.location.replace(this.PkceAuth.authorizeUrl(additionalParams));
    }
    decodeCallback(callback) {
        const decodedCallback = atob(callback);
        return decodedCallback;
    }

    getParameters(parameters) {
        this.transferData.datasetPid = parameters.datasetPid;
        // this.transferData.key = this.globusService.getParameterByName('apiToken');
        this.transferData.siteUrl = parameters.siteUrl;
        this.transferData.datasetId = parameters.datasetId;
        this.transferData.datasetVersion = parameters.datasetVersion;

        this.transferData.datasetDirectory = '/' +
            this.transferData.datasetPid.substring(this.transferData.datasetPid.indexOf(':') + 1) + '/';

        if ( typeof parameters.managed !== 'undefined' && parameters.managed === 'true') {
            this.transferData.managed = true;
            this.transferData.globusEndpoint = parameters.endpoint;

        } else {
            this.transferData.managed = false;
            this.transferData.referenceEndpointsWithPaths = parameters.referenceEndpointsWithPaths;
        }
        if (typeof parameters.files !== 'undefined' || parameters.files !== null) {
            this.transferData.files = parameters.files;
        }
    }

}
