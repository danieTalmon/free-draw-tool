import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MapComponent } from '@components/map/map.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MapComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  title = 'free-draw-action-tool';
}
